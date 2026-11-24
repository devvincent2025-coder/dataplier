package main

import (
	"crypto/rand"
	"crypto/sha256"
	"encoding/hex"
	"encoding/json"
	"log"
	"net/http"
	"os"
	"slices"
	"sort"
	"strconv"
	"strings"
	"sync"
	"time"
)

type User struct {
	ID                string     `json:"id"`
	Email             string     `json:"email"`
	FullName          string     `json:"full_name"`
	PasswordHash      string     `json:"-"`
	Role              string     `json:"role"`
	Company           string     `json:"company"`
	WorkspaceID       string     `json:"workspace_id"`
	WorkspaceSlug     string     `json:"workspace_slug"`
	WorkspaceName     string     `json:"workspace_name"`
	Plan              string     `json:"plan"`
	TrialStatus       string     `json:"trial_status"`
	TrialEndsAt       *time.Time `json:"trial_ends_at,omitempty"`
	SubscriptionState string     `json:"subscription_state"`
}

type WorkspaceRole string

const (
	RoleOwner    WorkspaceRole = "owner"
	RoleAdmin    WorkspaceRole = "admin"
	RoleEngineer WorkspaceRole = "engineer"
	RoleViewer   WorkspaceRole = "viewer"
)

type Session struct {
	Token          string    `json:"token"`
	UserID         string    `json:"user_id"`
	CreatedAt      time.Time `json:"created_at"`
	ExpiresAt      time.Time `json:"expires_at"`
	LastActivity   time.Time `json:"-"`
}

type PricingPlan struct {
	ID               string   `json:"id"`
	Name             string   `json:"name"`
	PriceMonthly     int      `json:"price_monthly"`
	PriceYearly      int      `json:"price_yearly"`
	TrialDays        int      `json:"trial_days"`
	Description      string   `json:"description"`
	Features         []string `json:"features"`
	Recommended      bool     `json:"recommended"`
	MaxPipelines     string   `json:"max_pipelines"`
	MaxConnectors    string   `json:"max_connectors"`
	SupportTier      string   `json:"support_tier"`
	IncludesLineage  bool     `json:"includes_lineage"`
	IncludesAutoFlow bool     `json:"includes_autoflow"`
}

type workspaceInvite struct {
	PublicID    string        `json:"id"`
	Token       string        `json:"-"`
	Email       string        `json:"email"`
	WorkspaceID string        `json:"workspace_id"`
	Role        WorkspaceRole `json:"role"`
	Permissions []string      `json:"permissions"`
	InvitedBy   string        `json:"invited_by"`
	CreatedAt   time.Time     `json:"created_at"`
}

type AuthService struct {
	mu                   sync.RWMutex
	users                map[string]User
	sessions             map[string]Session
	plans                []PricingPlan
	workspaceByUser      map[string][]Workspace
	workspaceMembers     map[string]map[string]WorkspaceRole
	workspaceMemberPerms map[string]map[string][]string
	workspaceInvites     []*workspaceInvite
	inviteByToken        map[string]*workspaceInvite
}

type Workspace struct {
	ID          string    `json:"id"`
	Name        string    `json:"name"`
	Slug        string    `json:"slug"`
	Region      string    `json:"region"`
	Environment string    `json:"environment"`
	Description string    `json:"description"`
	CreatedAt   time.Time `json:"created_at"`
	Role        string    `json:"role,omitempty"`
}

type signupRequest struct {
	FullName   string `json:"full_name"`
	Email      string `json:"email"`
	Password   string `json:"password"`
	Company    string `json:"company"`
	PlanID     string `json:"plan_id"`
	StartTrial bool   `json:"start_trial"`
}

type loginRequest struct {
	Email    string `json:"email"`
	Password string `json:"password"`
}

type forgotPasswordRequest struct {
	Email string `json:"email"`
}

type trialStartRequest struct {
	PlanID string `json:"plan_id"`
}

type createWorkspaceRequest struct {
	Name        string `json:"name"`
	Region      string `json:"region"`
	Environment string `json:"environment"`
	Description string `json:"description"`
}

type updateWorkspaceRequest struct {
	Name        string `json:"name"`
	Region      string `json:"region"`
	Environment string `json:"environment"`
	Description string `json:"description"`
}

type selectWorkspaceRequest struct {
	WorkspaceID string `json:"workspace_id"`
}

type assignWorkspaceAccessRequest struct {
	WorkspaceID string    `json:"workspace_id"`
	Email       string    `json:"email"`
	Role        string    `json:"role"`
	Permissions *[]string `json:"permissions,omitempty"`
}

type authorizeRequest struct {
	WorkspaceID string `json:"workspace_id"`
	Method      string `json:"method"`
	Path        string `json:"path"`
}

func main() {
	service := newAuthService()
	mux := http.NewServeMux()

	mux.HandleFunc("/healthz", service.withCORS(service.health))
	mux.HandleFunc("/roles", service.withCORS(service.roles))
	mux.HandleFunc("/pricing/plans", service.withCORS(service.pricingPlans))
	mux.HandleFunc("/signup", service.withCORS(service.signup))
	mux.HandleFunc("/login", service.withCORS(service.login))
	mux.HandleFunc("/forgot-password", service.withCORS(service.forgotPassword))
	mux.HandleFunc("/trial/start", service.withCORS(service.startTrial))
	mux.HandleFunc("/logout", service.withCORS(service.logout))
	mux.HandleFunc("/session", service.withCORS(service.session))
	mux.HandleFunc("/workspaces", service.withCORS(service.handleWorkspaces))
	mux.HandleFunc("/workspaces/", service.withCORS(service.handleWorkspaces))
	mux.HandleFunc("/workspaces/select", service.withCORS(service.selectWorkspace))
	mux.HandleFunc("/workspaces/access", service.withCORS(service.workspaceAccess))
	mux.HandleFunc("/invite/preview", service.withCORS(service.invitePreview))
	mux.HandleFunc("/invite/accept", service.withCORS(service.inviteAccept))
	mux.HandleFunc("/authorize", service.withCORS(service.authorize))
	mux.HandleFunc("/oauth/providers", service.withCORS(service.oauthProviders))

	log.Println("auth-service listening on :8081")
	_ = http.ListenAndServe(":8081", mux)
}

func newAuthService() *AuthService {
	trialEndsAt := time.Now().Add(14 * 24 * time.Hour)
	defaultUser := User{
		ID:                "user-demo-001",
		Email:             "architect@dataplier.io",
		FullName:          "Data Plier Architect",
		PasswordHash:      hashPassword("password123"),
		Role:              "admin",
		Company:           "Data Plier Labs",
		WorkspaceID:       "11111111-1111-1111-1111-111111111111",
		WorkspaceSlug:     "enterprise-control",
		WorkspaceName:     "Enterprise Control",
		Plan:              "growth",
		TrialStatus:       "active",
		TrialEndsAt:       &trialEndsAt,
		SubscriptionState: "trialing",
	}

	defaultWorkspace := Workspace{
		ID:          defaultUser.WorkspaceID,
		Name:        defaultUser.WorkspaceName,
		Slug:        defaultUser.WorkspaceSlug,
		Region:      "us-central1",
		Environment: "Production",
		Description: "Primary workspace for enterprise control and governance operations.",
		CreatedAt:   time.Now(),
	}

	return &AuthService{
		users: map[string]User{
			strings.ToLower(defaultUser.Email): defaultUser,
		},
		sessions: map[string]Session{},
		workspaceByUser: map[string][]Workspace{
			defaultUser.ID: {defaultWorkspace},
		},
		workspaceMembers: map[string]map[string]WorkspaceRole{
			defaultWorkspace.ID: {defaultUser.ID: RoleOwner},
		},
		workspaceMemberPerms: map[string]map[string][]string{},
		workspaceInvites:     []*workspaceInvite{},
		inviteByToken:        map[string]*workspaceInvite{},
		plans: []PricingPlan{
			{
				ID:               "starter",
				Name:             "Starter",
				PriceMonthly:     0,
				PriceYearly:      0,
				TrialDays:        14,
				Description:      "For evaluation teams validating Data Plier on a small number of flows.",
				Features:         []string{"2 pipelines", "3 connectors", "basic observability", "community support"},
				MaxPipelines:     "2",
				MaxConnectors:    "3",
				SupportTier:      "Community",
				IncludesLineage:  false,
				IncludesAutoFlow: false,
			},
			{
				ID:               "growth",
				Name:             "Growth",
				PriceMonthly:     499,
				PriceYearly:      4990,
				TrialDays:        14,
				Description:      "For platform and analytics teams that need autonomous routing and governance.",
				Features:         []string{"25 pipelines", "15 connectors", "lineage graph", "self-driving routing", "email support"},
				Recommended:      true,
				MaxPipelines:     "25",
				MaxConnectors:    "15",
				SupportTier:      "Business",
				IncludesLineage:  true,
				IncludesAutoFlow: true,
			},
			{
				ID:               "enterprise",
				Name:             "Enterprise",
				PriceMonthly:     1999,
				PriceYearly:      19990,
				TrialDays:        30,
				Description:      "For banks, telecom, and regulated workloads with advanced governance and premium support.",
				Features:         []string{"Unlimited pipelines", "Unlimited connectors", "advanced RBAC", "audit controls", "dedicated support"},
				MaxPipelines:     "Unlimited",
				MaxConnectors:    "Unlimited",
				SupportTier:      "Dedicated",
				IncludesLineage:  true,
				IncludesAutoFlow: true,
			},
		},
	}
}

func (s *AuthService) health(w http.ResponseWriter, r *http.Request) {
	if r.Method != http.MethodGet {
		methodNotAllowed(w)
		return
	}
	writeJSON(w, http.StatusOK, map[string]any{"service": "auth-service", "status": "ok"})
}

func (s *AuthService) roles(w http.ResponseWriter, r *http.Request) {
	if r.Method != http.MethodGet {
		methodNotAllowed(w)
		return
	}
	writeJSON(w, http.StatusOK, map[string]any{
		"roles": []string{"owner", "admin", "engineer", "viewer"},
		"definitions": []map[string]any{
			{
				"id": "owner", "label": "Owner", "description": "Full workspace control including billing posture, member roles, and destructive actions.",
				"permissions": permissionsForRole(RoleOwner),
			},
			{
				"id": "admin", "label": "Admin", "description": "Operational control: connectors, pipelines, jobs, and member access without ownership transfer.",
				"permissions": permissionsForRole(RoleAdmin),
			},
			{
				"id": "engineer", "label": "Engineer", "description": "Build and run data movement; read/write connectors, datasets, pipelines, and jobs.",
				"permissions": permissionsForRole(RoleEngineer),
			},
			{
				"id": "viewer", "label": "Viewer", "description": "Read-only workspace visibility for monitoring and audits.",
				"permissions": permissionsForRole(RoleViewer),
			},
		},
	})
}

func (s *AuthService) pricingPlans(w http.ResponseWriter, r *http.Request) {
	if r.Method != http.MethodGet {
		methodNotAllowed(w)
		return
	}
	writeJSON(w, http.StatusOK, map[string]any{"plans": s.plans})
}

func (s *AuthService) signup(w http.ResponseWriter, r *http.Request) {
	if r.Method != http.MethodPost {
		methodNotAllowed(w)
		return
	}

	var req signupRequest
	if !decodeJSON(w, r, &req) {
		return
	}
	if req.Email == "" || req.Password == "" || req.FullName == "" {
		writeJSON(w, http.StatusBadRequest, map[string]string{"error": "full_name, email, and password are required"})
		return
	}

	email := strings.ToLower(strings.TrimSpace(req.Email))

	s.mu.Lock()
	defer s.mu.Unlock()

	if _, exists := s.users[email]; exists {
		writeJSON(w, http.StatusConflict, map[string]string{"error": "user already exists"})
		return
	}

	trialStatus := "inactive"
	subscriptionState := "inactive"
	var trialEndsAt *time.Time
	if req.StartTrial {
		days := s.planTrialDays(req.PlanID)
		if days == 0 {
			days = 14
		}
		end := time.Now().Add(time.Duration(days) * 24 * time.Hour)
		trialEndsAt = &end
		trialStatus = "active"
		subscriptionState = "trialing"
	}

	newUser := User{
		ID:                "user-" + newToken(8),
		Email:             email,
		FullName:          req.FullName,
		PasswordHash:      hashPassword(req.Password),
		Role:              "admin",
		Company:           req.Company,
		WorkspaceID:       "workspace-" + newToken(8),
		WorkspaceSlug:     slugify(firstNonEmpty(req.Company, "new-workspace")),
		WorkspaceName:     firstNonEmpty(req.Company, "New Workspace"),
		Plan:              firstNonEmpty(req.PlanID, "starter"),
		TrialStatus:       trialStatus,
		TrialEndsAt:       trialEndsAt,
		SubscriptionState: subscriptionState,
	}
	s.users[email] = newUser
	s.workspaceByUser[newUser.ID] = []Workspace{
		{
			ID:          newUser.WorkspaceID,
			Name:        newUser.WorkspaceName,
			Slug:        newUser.WorkspaceSlug,
			Region:      "us-central1",
			Environment: "Development",
			Description: "Default workspace created during signup.",
			CreatedAt:   time.Now(),
		},
	}
	s.workspaceMembers[newUser.WorkspaceID] = map[string]WorkspaceRole{newUser.ID: RoleOwner}

	maxMin := sessionMaxAgeMinutes(newUser.WorkspaceID)
	token, session := s.issueSession(newUser.ID, maxMin)
	s.sessions[token] = session

	writeJSON(w, http.StatusCreated, map[string]any{
		"token":   token,
		"user":    s.sanitizeUserLocked(newUser),
		"session": session,
	})
}

func (s *AuthService) handleWorkspaces(w http.ResponseWriter, r *http.Request) {
	user, _, ok := s.requireUser(w, r)
	if !ok {
		return
	}

	sub := strings.Trim(strings.TrimPrefix(r.URL.Path, "/workspaces"), "/")
	if sub == "invite" {
		if r.Method != http.MethodPost {
			methodNotAllowed(w)
			return
		}
		s.postWorkspaceInvite(w, r, user)
		return
	}
	if sub == "invites" {
		switch r.Method {
		case http.MethodGet:
			s.listWorkspaceInvites(w, r, user)
		case http.MethodDelete:
			s.deleteWorkspaceInvite(w, r, user)
		default:
			methodNotAllowed(w)
		}
		return
	}

	// Sub-resource /workspaces/{id} (DELETE/PATCH). Must live here so it is not shadowed by
	// less-specific patterns when routing behind reverse proxies.
	if sub != "" && sub != "select" && sub != "access" && !strings.Contains(sub, "/") {
		workspaceID := strings.TrimSpace(sub)
		switch r.Method {
		case http.MethodDelete:
			s.deleteWorkspaceForID(w, user, workspaceID)
			return
		case http.MethodPatch:
			s.patchWorkspaceForID(w, r, user, workspaceID)
			return
		default:
			methodNotAllowed(w)
			return
		}
	}

	switch r.Method {
	case http.MethodGet:
		s.mu.RLock()
		items := append([]Workspace{}, s.workspaceByUser[user.ID]...)
		for idx := range items {
			items[idx].Role = string(s.workspaceMembers[items[idx].ID][user.ID])
		}
		s.mu.RUnlock()
		writeJSON(w, http.StatusOK, map[string]any{"items": items})
	case http.MethodPost:
		var req createWorkspaceRequest
		if !decodeJSON(w, r, &req) {
			return
		}
		if strings.TrimSpace(req.Name) == "" {
			writeJSON(w, http.StatusBadRequest, map[string]string{"error": "workspace name is required"})
			return
		}

		s.mu.Lock()
		defer s.mu.Unlock()

		items := s.workspaceByUser[user.ID]
		baseSlug := slugify(req.Name)
		if baseSlug == "" {
			baseSlug = "workspace"
		}
		nextSlug := baseSlug
		i := 2
		for workspaceSlugExists(items, nextSlug) {
			nextSlug = baseSlug + "-" + intToString(i)
			i++
		}

		workspace := Workspace{
			ID:          "workspace-" + newToken(8),
			Name:        strings.TrimSpace(req.Name),
			Slug:        nextSlug,
			Region:      firstNonEmpty(strings.TrimSpace(req.Region), "us-central1"),
			Environment: firstNonEmpty(strings.TrimSpace(req.Environment), "Development"),
			Description: strings.TrimSpace(req.Description),
			CreatedAt:   time.Now(),
		}

		s.workspaceByUser[user.ID] = append([]Workspace{workspace}, items...)
		if s.workspaceMembers[workspace.ID] == nil {
			s.workspaceMembers[workspace.ID] = map[string]WorkspaceRole{}
		}
		s.workspaceMembers[workspace.ID][user.ID] = RoleOwner
		workspace.Role = string(RoleOwner)
		writeJSON(w, http.StatusCreated, map[string]any{"item": workspace})
	default:
		methodNotAllowed(w)
	}
}

func removeWorkspaceFromList(items []Workspace, id string) []Workspace {
	out := make([]Workspace, 0, len(items))
	for _, w := range items {
		if w.ID != id {
			out = append(out, w)
		}
	}
	return out
}

func (s *AuthService) deleteWorkspaceForID(w http.ResponseWriter, user User, workspaceID string) {
	if workspaceID == "" {
		writeJSON(w, http.StatusBadRequest, map[string]string{"error": "workspace id is required"})
		return
	}

	s.mu.Lock()
	defer s.mu.Unlock()

	if !userHasWorkspaceLocked(s.workspaceByUser[user.ID], workspaceID) {
		writeJSON(w, http.StatusNotFound, map[string]string{"error": "workspace not found"})
		return
	}

	role := s.workspaceMembers[workspaceID][user.ID]
	if role != RoleOwner && role != RoleAdmin {
		writeJSON(w, http.StatusForbidden, map[string]string{"error": "only owners and admins can delete a workspace"})
		return
	}

	if len(s.workspaceByUser[user.ID]) <= 1 {
		writeJSON(w, http.StatusBadRequest, map[string]string{"error": "cannot delete your only workspace"})
		return
	}

	for uid := range s.workspaceByUser {
		s.workspaceByUser[uid] = removeWorkspaceFromList(s.workspaceByUser[uid], workspaceID)
	}
	delete(s.workspaceMembers, workspaceID)

	for emailKey, u := range s.users {
		if u.WorkspaceID != workspaceID {
			continue
		}
		remaining := s.workspaceByUser[u.ID]
		if len(remaining) == 0 {
			u.WorkspaceID = ""
			u.WorkspaceSlug = ""
			u.WorkspaceName = ""
		} else {
			next := remaining[0]
			u.WorkspaceID = next.ID
			u.WorkspaceSlug = next.Slug
			u.WorkspaceName = next.Name
		}
		s.users[emailKey] = u
	}

	writeJSON(w, http.StatusOK, map[string]string{"status": "deleted"})
}

func (s *AuthService) patchWorkspaceForID(w http.ResponseWriter, r *http.Request, user User, workspaceID string) {
	if workspaceID == "" {
		writeJSON(w, http.StatusBadRequest, map[string]string{"error": "workspace id is required"})
		return
	}
	var req updateWorkspaceRequest
	if !decodeJSON(w, r, &req) {
		return
	}
	if strings.TrimSpace(req.Name) == "" {
		writeJSON(w, http.StatusBadRequest, map[string]string{"error": "workspace name is required"})
		return
	}

	s.mu.Lock()
	defer s.mu.Unlock()

	if !userHasWorkspaceLocked(s.workspaceByUser[user.ID], workspaceID) {
		writeJSON(w, http.StatusNotFound, map[string]string{"error": "workspace not found"})
		return
	}
	role := s.workspaceMembers[workspaceID][user.ID]
	if role != RoleOwner && role != RoleAdmin {
		writeJSON(w, http.StatusForbidden, map[string]string{"error": "only owners and admins can update a workspace"})
		return
	}

	name := strings.TrimSpace(req.Name)
	region := firstNonEmpty(strings.TrimSpace(req.Region), "us-central1")
	environment := firstNonEmpty(strings.TrimSpace(req.Environment), "Development")
	description := strings.TrimSpace(req.Description)

	for uid := range s.workspaceByUser {
		items := s.workspaceByUser[uid]
		for i := range items {
			if items[i].ID == workspaceID {
				items[i].Name = name
				items[i].Region = region
				items[i].Environment = environment
				items[i].Description = description
			}
		}
		s.workspaceByUser[uid] = items
	}

	for emailKey, u := range s.users {
		if u.WorkspaceID != workspaceID {
			continue
		}
		u.WorkspaceName = name
		s.users[emailKey] = u
	}

	updated := s.findWorkspaceByIDForAnyUserLocked(workspaceID)
	updated.Role = string(s.workspaceMembers[workspaceID][user.ID])
	writeJSON(w, http.StatusOK, map[string]any{"item": updated})
}

func (s *AuthService) selectWorkspace(w http.ResponseWriter, r *http.Request) {
	if r.Method != http.MethodPost {
		methodNotAllowed(w)
		return
	}

	user, token, ok := s.requireUser(w, r)
	if !ok {
		return
	}

	var req selectWorkspaceRequest
	if !decodeJSON(w, r, &req) {
		return
	}
	if strings.TrimSpace(req.WorkspaceID) == "" {
		writeJSON(w, http.StatusBadRequest, map[string]string{"error": "workspace_id is required"})
		return
	}

	s.mu.Lock()
	defer s.mu.Unlock()

	items := s.workspaceByUser[user.ID]
	var selected *Workspace
	for idx := range items {
		if items[idx].ID == req.WorkspaceID {
			selected = &items[idx]
			break
		}
	}
	if selected == nil {
		writeJSON(w, http.StatusNotFound, map[string]string{"error": "workspace not found"})
		return
	}

	if user.WorkspaceID == req.WorkspaceID {
		session := s.sessions[token]
		writeJSON(w, http.StatusOK, map[string]any{
			"user":    s.sanitizeUserLocked(user),
			"session": session,
		})
		return
	}

	sourceRole := s.workspaceMembers[user.WorkspaceID][user.ID]
	if sourceRole != RoleOwner && sourceRole != RoleAdmin {
		writeJSON(w, http.StatusForbidden, map[string]string{
			"error": "Only workspace owners and admins in your current workspace may change the active workspace. Ask an owner or admin if you need access elsewhere.",
		})
		return
	}

	user.WorkspaceID = selected.ID
	user.WorkspaceSlug = selected.Slug
	user.WorkspaceName = selected.Name
	s.users[strings.ToLower(user.Email)] = user

	session := s.sessions[token]
	writeJSON(w, http.StatusOK, map[string]any{
		"user":    s.sanitizeUserLocked(user),
		"session": session,
	})
}

func (s *AuthService) workspaceAccess(w http.ResponseWriter, r *http.Request) {
	user, _, ok := s.requireUser(w, r)
	if !ok {
		return
	}

	switch r.Method {
	case http.MethodGet:
		workspaceID := strings.TrimSpace(r.URL.Query().Get("workspace_id"))
		if workspaceID == "" {
			writeJSON(w, http.StatusBadRequest, map[string]string{"error": "workspace_id is required"})
			return
		}
		s.mu.RLock()
		members, found := s.workspaceMembers[workspaceID]
		role := members[user.ID]
		if !found || role == "" {
			s.mu.RUnlock()
			writeJSON(w, http.StatusForbidden, map[string]string{"error": "workspace access denied"})
			return
		}
		type memberItem struct {
			UserID      string   `json:"user_id"`
			Email       string   `json:"email"`
			FullName    string   `json:"full_name"`
			Role        string   `json:"role"`
			Permissions []string `json:"permissions"`
		}
		items := []memberItem{}
		for memberID, memberRole := range members {
			memberUser := s.findUserByIDLocked(memberID)
			if memberUser.ID == "" {
				continue
			}
			items = append(items, memberItem{
				UserID:      memberUser.ID,
				Email:       memberUser.Email,
				FullName:    memberUser.FullName,
				Role:        string(memberRole),
				Permissions: s.effectivePermissionsLocked(workspaceID, memberID),
			})
		}
		invitesOut := []map[string]any{}
		for _, inv := range s.workspaceInvites {
			if inv.WorkspaceID != workspaceID {
				continue
			}
			invitesOut = append(invitesOut, map[string]any{
				"id":          inv.PublicID,
				"email":       inv.Email,
				"role":        string(inv.Role),
				"permissions": inv.Permissions,
				"created_at":  inv.CreatedAt,
			})
		}
		s.mu.RUnlock()
		writeJSON(w, http.StatusOK, map[string]any{"items": items, "invites": invitesOut})
	case http.MethodPost:
		var req assignWorkspaceAccessRequest
		if !decodeJSON(w, r, &req) {
			return
		}
		role, valid := parseWorkspaceRole(req.Role)
		if !valid {
			writeJSON(w, http.StatusBadRequest, map[string]string{"error": "invalid role"})
			return
		}
		workspaceID := strings.TrimSpace(req.WorkspaceID)
		if workspaceID == "" || strings.TrimSpace(req.Email) == "" {
			writeJSON(w, http.StatusBadRequest, map[string]string{"error": "workspace_id and email are required"})
			return
		}

		s.mu.Lock()
		defer s.mu.Unlock()
		if !s.hasPermissionLocked(user.ID, workspaceID, "workspace.access.manage") {
			writeJSON(w, http.StatusForbidden, map[string]string{"error": "missing permission: workspace.access.manage"})
			return
		}

		var permOverride []string
		var applyPermOverride bool
		if req.Permissions != nil {
			var ok bool
			permOverride, ok = normalizeMemberPermissionOverride(role, *req.Permissions)
			if !ok {
				writeJSON(w, http.StatusBadRequest, map[string]string{"error": "permissions must be a subset of the selected role"})
				return
			}
			applyPermOverride = true
		}

		target, exists := s.users[strings.ToLower(strings.TrimSpace(req.Email))]
		if !exists {
			writeJSON(w, http.StatusNotFound, map[string]string{"error": "user not found"})
			return
		}
		if s.workspaceMembers[workspaceID] == nil {
			s.workspaceMembers[workspaceID] = map[string]WorkspaceRole{}
		}
		s.workspaceMembers[workspaceID][target.ID] = role
		if !userHasWorkspaceLocked(s.workspaceByUser[target.ID], workspaceID) {
			workspace := s.findWorkspaceByIDForAnyUserLocked(workspaceID)
			if workspace.ID != "" {
				workspace.Role = string(role)
				s.workspaceByUser[target.ID] = append([]Workspace{workspace}, s.workspaceByUser[target.ID]...)
			}
		}
		if applyPermOverride {
			s.applyPermissionOverrideLocked(workspaceID, target.ID, permOverride)
		}

		writeJSON(w, http.StatusOK, map[string]any{
			"status": "granted",
			"user":   map[string]string{"id": target.ID, "email": target.Email},
			"role":   string(role),
		})
	case http.MethodDelete:
		workspaceID := strings.TrimSpace(r.URL.Query().Get("workspace_id"))
		targetUserID := strings.TrimSpace(r.URL.Query().Get("user_id"))
		if workspaceID == "" || targetUserID == "" {
			writeJSON(w, http.StatusBadRequest, map[string]string{"error": "workspace_id and user_id are required"})
			return
		}
		s.mu.Lock()
		defer s.mu.Unlock()
		if !s.hasPermissionLocked(user.ID, workspaceID, "workspace.access.manage") {
			writeJSON(w, http.StatusForbidden, map[string]string{"error": "missing permission: workspace.access.manage"})
			return
		}
		if targetUserID == user.ID {
			writeJSON(w, http.StatusBadRequest, map[string]string{"error": "cannot revoke your own workspace access"})
			return
		}
		members := s.workspaceMembers[workspaceID]
		targetRole := members[targetUserID]
		if targetRole == "" {
			writeJSON(w, http.StatusNotFound, map[string]string{"error": "member not found in workspace"})
			return
		}
		if targetRole == RoleOwner {
			writeJSON(w, http.StatusBadRequest, map[string]string{"error": "cannot revoke an owner; transfer ownership first"})
			return
		}
		delete(members, targetUserID)
		if len(members) == 0 {
			delete(s.workspaceMembers, workspaceID)
		}
		if s.workspaceMemberPerms[workspaceID] != nil {
			delete(s.workspaceMemberPerms[workspaceID], targetUserID)
		}
		if s.workspaceByUser[targetUserID] != nil {
			s.workspaceByUser[targetUserID] = removeWorkspaceFromList(s.workspaceByUser[targetUserID], workspaceID)
		}
		writeJSON(w, http.StatusOK, map[string]any{"status": "revoked", "user_id": targetUserID})
	default:
		methodNotAllowed(w)
	}
}

func (s *AuthService) authorize(w http.ResponseWriter, r *http.Request) {
	if r.Method != http.MethodPost {
		methodNotAllowed(w)
		return
	}
	user, _, ok := s.requireUser(w, r)
	if !ok {
		return
	}
	var req authorizeRequest
	if !decodeJSON(w, r, &req) {
		return
	}
	if strings.TrimSpace(req.WorkspaceID) == "" {
		writeJSON(w, http.StatusBadRequest, map[string]string{"error": "workspace_id is required"})
		return
	}
	required := permissionForRoute(req.Method, req.Path)
	s.mu.RLock()
	allowed := s.hasPermissionLocked(user.ID, req.WorkspaceID, required)
	role := s.workspaceMembers[req.WorkspaceID][user.ID]
	effective := s.effectivePermissionsLocked(req.WorkspaceID, user.ID)
	s.mu.RUnlock()
	if !allowed {
		writeJSON(w, http.StatusForbidden, map[string]any{"allowed": false, "required_permission": required})
		return
	}
	writeJSON(w, http.StatusOK, map[string]any{
		"allowed":             true,
		"required_permission": required,
		"role":                string(role),
		"permissions":         effective,
	})
}

func (s *AuthService) login(w http.ResponseWriter, r *http.Request) {
	if r.Method != http.MethodPost {
		methodNotAllowed(w)
		return
	}

	var req loginRequest
	if !decodeJSON(w, r, &req) {
		return
	}

	emailKey := strings.ToLower(strings.TrimSpace(req.Email))

	s.mu.Lock()
	user, exists := s.users[emailKey]
	valid := exists && user.PasswordHash == hashPassword(req.Password)
	wsID := ""
	if valid {
		wsID = user.WorkspaceID
	}
	s.mu.Unlock()
	if !valid {
		writeJSON(w, http.StatusUnauthorized, map[string]string{"error": "invalid email or password"})
		return
	}

	maxMin := sessionMaxAgeMinutes(wsID)

	s.mu.Lock()
	defer s.mu.Unlock()
	user = s.users[emailKey]
	token, session := s.issueSession(user.ID, maxMin)
	s.sessions[token] = session

	writeJSON(w, http.StatusOK, map[string]any{
		"token":   token,
		"user":    s.sanitizeUserLocked(user),
		"session": session,
	})
}

func (s *AuthService) forgotPassword(w http.ResponseWriter, r *http.Request) {
	if r.Method != http.MethodPost {
		methodNotAllowed(w)
		return
	}

	var req forgotPasswordRequest
	if !decodeJSON(w, r, &req) {
		return
	}

	writeJSON(w, http.StatusOK, map[string]any{
		"status":  "accepted",
		"message": "If the account exists, a reset link has been queued.",
		"email":   strings.ToLower(strings.TrimSpace(req.Email)),
	})
}

func (s *AuthService) startTrial(w http.ResponseWriter, r *http.Request) {
	if r.Method != http.MethodPost {
		methodNotAllowed(w)
		return
	}

	user, token, ok := s.requireUser(w, r)
	if !ok {
		return
	}

	var req trialStartRequest
	if !decodeJSON(w, r, &req) {
		return
	}

	s.mu.Lock()
	defer s.mu.Unlock()

	days := s.planTrialDays(req.PlanID)
	if days == 0 {
		days = 14
	}
	end := time.Now().Add(time.Duration(days) * 24 * time.Hour)
	user.Plan = firstNonEmpty(req.PlanID, user.Plan)
	user.TrialStatus = "active"
	user.SubscriptionState = "trialing"
	user.TrialEndsAt = &end
	s.users[strings.ToLower(user.Email)] = user

	session := s.sessions[token]

	writeJSON(w, http.StatusOK, map[string]any{
		"user":    s.sanitizeUserLocked(user),
		"session": session,
	})
}

func (s *AuthService) logout(w http.ResponseWriter, r *http.Request) {
	if r.Method != http.MethodPost {
		methodNotAllowed(w)
		return
	}

	token := bearerToken(r)
	if token == "" {
		writeJSON(w, http.StatusUnauthorized, map[string]string{"error": "missing bearer token"})
		return
	}

	s.mu.Lock()
	delete(s.sessions, token)
	s.mu.Unlock()

	writeJSON(w, http.StatusOK, map[string]string{"status": "logged_out"})
}

func (s *AuthService) session(w http.ResponseWriter, r *http.Request) {
	if r.Method != http.MethodGet {
		methodNotAllowed(w)
		return
	}

	user, token, ok := s.requireUser(w, r)
	if !ok {
		return
	}

	s.mu.RLock()
	session := s.sessions[token]
	s.mu.RUnlock()

	writeJSON(w, http.StatusOK, map[string]any{
		"user":    s.sanitizeUser(user),
		"session": session,
	})
}

func (s *AuthService) oauthProviders(w http.ResponseWriter, r *http.Request) {
	if r.Method != http.MethodGet {
		methodNotAllowed(w)
		return
	}
	writeJSON(w, http.StatusOK, map[string]any{
		"providers": []map[string]string{
			{"id": "google", "label": "Continue with Google", "status": "stubbed"},
			{"id": "github", "label": "Continue with GitHub", "status": "stubbed"},
		},
	})
}

func (s *AuthService) requireUser(w http.ResponseWriter, r *http.Request) (User, string, bool) {
	token := bearerToken(r)
	if token == "" {
		writeJSON(w, http.StatusUnauthorized, map[string]string{"error": "missing bearer token"})
		return User{}, "", false
	}

	s.mu.RLock()
	session, exists := s.sessions[token]
	if !exists || session.ExpiresAt.Before(time.Now()) {
		s.mu.RUnlock()
		writeJSON(w, http.StatusUnauthorized, map[string]string{"error": "session expired"})
		return User{}, "", false
	}
	uid := session.UserID
	var wsID string
	for _, u := range s.users {
		if u.ID == uid {
			wsID = u.WorkspaceID
			break
		}
	}
	snap := session
	s.mu.RUnlock()

	idleMin := sessionIdleMinutes(wsID)
	if idleMin > 0 {
		last := snap.LastActivity
		if last.IsZero() {
			last = snap.CreatedAt
		}
		if time.Since(last) > time.Duration(idleMin)*time.Minute {
			s.mu.Lock()
			delete(s.sessions, token)
			s.mu.Unlock()
			writeJSON(w, http.StatusUnauthorized, map[string]string{"error": "session idle timeout"})
			return User{}, "", false
		}
	}

	s.mu.Lock()
	defer s.mu.Unlock()
	session, exists = s.sessions[token]
	if !exists || session.ExpiresAt.Before(time.Now()) {
		writeJSON(w, http.StatusUnauthorized, map[string]string{"error": "session expired"})
		return User{}, "", false
	}
	var user User
	for _, u := range s.users {
		if u.ID == session.UserID {
			user = u
			break
		}
	}
	if user.ID == "" {
		writeJSON(w, http.StatusUnauthorized, map[string]string{"error": "user not found"})
		return User{}, "", false
	}
	session.LastActivity = time.Now()
	s.sessions[token] = session

	return user, token, true
}

func (s *AuthService) issueSession(userID string, maxAgeMinutes int) (string, Session) {
	token := "dp_" + newToken(24)
	now := time.Now()
	if maxAgeMinutes < 5 {
		maxAgeMinutes = 5
	}
	if maxAgeMinutes > 43200 {
		maxAgeMinutes = 43200
	}
	dur := time.Duration(maxAgeMinutes) * time.Minute
	session := Session{
		Token:          token,
		UserID:         userID,
		CreatedAt:      now,
		ExpiresAt:      now.Add(dur),
		LastActivity:   now,
	}
	return token, session
}

func (s *AuthService) planTrialDays(planID string) int {
	for _, plan := range s.plans {
		if plan.ID == planID {
			return plan.TrialDays
		}
	}
	return 0
}

func (s *AuthService) withCORS(next http.HandlerFunc) http.HandlerFunc {
	return func(w http.ResponseWriter, r *http.Request) {
		w.Header().Set("Access-Control-Allow-Origin", "*")
		w.Header().Set("Access-Control-Allow-Headers", "Content-Type, Authorization")
		w.Header().Set("Access-Control-Allow-Methods", "GET, POST, PUT, PATCH, DELETE, OPTIONS")
		if r.Method == http.MethodOptions {
			w.WriteHeader(http.StatusNoContent)
			return
		}
		next(w, r)
	}
}

func (s *AuthService) sanitizeUser(user User) map[string]any {
	s.mu.RLock()
	defer s.mu.RUnlock()
	return s.sanitizeUserLocked(user)
}

func (s *AuthService) sanitizeUserLocked(user User) map[string]any {
	role := s.workspaceMembers[user.WorkspaceID][user.ID]
	if role == "" {
		role = RoleViewer
	}
	return map[string]any{
		"id":                 user.ID,
		"email":              user.Email,
		"full_name":          user.FullName,
		"role":               user.Role,
		"company":            user.Company,
		"workspace_id":       user.WorkspaceID,
		"workspace_slug":     user.WorkspaceSlug,
		"workspace_name":     user.WorkspaceName,
		"plan":               user.Plan,
		"trial_status":       user.TrialStatus,
		"trial_ends_at":      user.TrialEndsAt,
		"subscription_state": user.SubscriptionState,
		"workspace_role":     string(role),
		"permissions":        s.effectivePermissionsLocked(user.WorkspaceID, user.ID),
	}
}

func decodeJSON(w http.ResponseWriter, r *http.Request, target any) bool {
	defer r.Body.Close()
	if err := json.NewDecoder(r.Body).Decode(target); err != nil {
		writeJSON(w, http.StatusBadRequest, map[string]string{"error": "invalid json payload"})
		return false
	}
	return true
}

func bearerToken(r *http.Request) string {
	header := r.Header.Get("Authorization")
	if !strings.HasPrefix(header, "Bearer ") {
		return ""
	}
	return strings.TrimSpace(strings.TrimPrefix(header, "Bearer "))
}

func writeJSON(w http.ResponseWriter, status int, payload any) {
	w.Header().Set("Content-Type", "application/json")
	w.WriteHeader(status)
	_ = json.NewEncoder(w).Encode(payload)
}

func methodNotAllowed(w http.ResponseWriter) {
	writeJSON(w, http.StatusMethodNotAllowed, map[string]string{"error": "method not allowed"})
}

func hashPassword(password string) string {
	hash := sha256.Sum256([]byte(password))
	return hex.EncodeToString(hash[:])
}

func newToken(byteLen int) string {
	buf := make([]byte, byteLen)
	if _, err := rand.Read(buf); err != nil {
		return hex.EncodeToString([]byte(time.Now().Format(time.RFC3339Nano)))
	}
	return hex.EncodeToString(buf)
}

func firstNonEmpty(values ...string) string {
	for _, value := range values {
		if strings.TrimSpace(value) != "" {
			return value
		}
	}
	return ""
}

func slugify(value string) string {
	slug := strings.ToLower(strings.TrimSpace(value))
	slug = strings.ReplaceAll(slug, " ", "-")
	slug = strings.ReplaceAll(slug, "_", "-")
	return slug
}

func workspaceSlugExists(items []Workspace, slug string) bool {
	for _, item := range items {
		if item.Slug == slug {
			return true
		}
	}
	return false
}

func parseWorkspaceRole(value string) (WorkspaceRole, bool) {
	switch WorkspaceRole(strings.ToLower(strings.TrimSpace(value))) {
	case RoleOwner:
		return RoleOwner, true
	case RoleAdmin:
		return RoleAdmin, true
	case RoleEngineer:
		return RoleEngineer, true
	case RoleViewer:
		return RoleViewer, true
	default:
		return "", false
	}
}

func permissionsForRole(role WorkspaceRole) []string {
	switch role {
	case RoleOwner:
		return []string{
			"workspace.read", "workspace.write", "workspace.access.manage",
			"connections.read", "connections.write",
			"datasets.read", "datasets.write",
			"pipelines.read", "pipelines.write",
			"jobs.read", "jobs.write",
			"governance.read", "governance.write",
		}
	case RoleAdmin:
		return []string{
			"workspace.read", "workspace.write", "workspace.access.manage",
			"connections.read", "connections.write",
			"datasets.read", "datasets.write",
			"pipelines.read", "pipelines.write",
			"jobs.read", "jobs.write",
			"governance.read", "governance.write",
		}
	case RoleEngineer:
		return []string{
			"workspace.read",
			"connections.read", "connections.write",
			"datasets.read", "datasets.write",
			"pipelines.read", "pipelines.write",
			"jobs.read", "jobs.write",
			"governance.read",
		}
	default:
		return []string{
			"workspace.read",
			"connections.read",
			"datasets.read",
			"pipelines.read",
			"jobs.read",
			"governance.read",
		}
	}
}

func hasPermission(permissions []string, required string) bool {
	for _, permission := range permissions {
		if permission == required {
			return true
		}
	}
	return false
}

func (s *AuthService) hasPermissionLocked(userID string, workspaceID string, required string) bool {
	role := s.workspaceMembers[workspaceID][userID]
	if role == "" {
		return false
	}
	if required == "" {
		return true
	}
	return hasPermission(s.effectivePermissionsLocked(workspaceID, userID), required)
}

func permissionForRoute(method string, path string) string {
	method = strings.ToUpper(strings.TrimSpace(method))
	if strings.HasPrefix(path, "/connections") {
		if method == http.MethodGet {
			return "connections.read"
		}
		return "connections.write"
	}
	if strings.HasPrefix(path, "/datasets") {
		if method == http.MethodGet {
			return "datasets.read"
		}
		return "datasets.write"
	}
	if strings.HasPrefix(path, "/pipelines") {
		if method == http.MethodGet {
			return "pipelines.read"
		}
		return "pipelines.write"
	}
	if strings.HasPrefix(path, "/jobs") {
		if method == http.MethodGet {
			return "jobs.read"
		}
		return "jobs.write"
	}
	if strings.HasPrefix(path, "/routing") {
		if method == http.MethodGet {
			return "pipelines.read"
		}
		return "pipelines.write"
	}
	if strings.HasPrefix(path, "/metadata") || strings.HasPrefix(path, "/metrics") || strings.HasPrefix(path, "/lineage") {
		if method == http.MethodGet {
			return "governance.read"
		}
		return "governance.write"
	}
	return "workspace.read"
}

func userHasWorkspaceLocked(items []Workspace, workspaceID string) bool {
	for _, item := range items {
		if item.ID == workspaceID {
			return true
		}
	}
	return false
}

func (s *AuthService) findUserByIDLocked(userID string) User {
	for _, user := range s.users {
		if user.ID == userID {
			return user
		}
	}
	return User{}
}

func (s *AuthService) findWorkspaceByIDForAnyUserLocked(workspaceID string) Workspace {
	for _, items := range s.workspaceByUser {
		for _, item := range items {
			if item.ID == workspaceID {
				return item
			}
		}
	}
	return Workspace{}
}

func (s *AuthService) effectivePermissionsLocked(workspaceID, userID string) []string {
	role := s.workspaceMembers[workspaceID][userID]
	if role == "" {
		return nil
	}
	if m, ok := s.workspaceMemberPerms[workspaceID]; ok {
		if p, ok2 := m[userID]; ok2 && len(p) > 0 {
			out := append([]string(nil), p...)
			sort.Strings(out)
			return out
		}
	}
	return permissionsForRole(role)
}

// normalizeMemberPermissionOverride returns nil when the member should inherit the role's full permission set.
func normalizeMemberPermissionOverride(role WorkspaceRole, requested []string) ([]string, bool) {
	rolePerms := permissionsForRole(role)
	if len(requested) == 0 {
		return nil, true
	}
	allowed := map[string]struct{}{}
	for _, p := range rolePerms {
		allowed[p] = struct{}{}
	}
	out := make([]string, 0, len(requested))
	seen := map[string]struct{}{}
	for _, p := range requested {
		p = strings.TrimSpace(p)
		if p == "" {
			continue
		}
		if _, ok := allowed[p]; !ok {
			return nil, false
		}
		if _, dup := seen[p]; dup {
			continue
		}
		seen[p] = struct{}{}
		out = append(out, p)
	}
	if len(out) == 0 {
		return nil, true
	}
	sort.Strings(out)
	sortedRole := append([]string(nil), rolePerms...)
	sort.Strings(sortedRole)
	if slices.Equal(out, sortedRole) {
		return nil, true
	}
	return out, true
}

func (s *AuthService) applyPermissionOverrideLocked(workspaceID, userID string, override []string) {
	if s.workspaceMemberPerms[workspaceID] == nil {
		s.workspaceMemberPerms[workspaceID] = map[string][]string{}
	}
	if len(override) == 0 {
		delete(s.workspaceMemberPerms[workspaceID], userID)
		return
	}
	cp := append([]string(nil), override...)
	sort.Strings(cp)
	s.workspaceMemberPerms[workspaceID][userID] = cp
}

type createInviteRequest struct {
	WorkspaceID string   `json:"workspace_id"`
	Email       string   `json:"email"`
	Role        string   `json:"role"`
	Permissions []string `json:"permissions"`
}

func (s *AuthService) postWorkspaceInvite(w http.ResponseWriter, r *http.Request, actor User) {
	var req createInviteRequest
	if !decodeJSON(w, r, &req) {
		return
	}
	role, valid := parseWorkspaceRole(req.Role)
	if !valid || role == RoleOwner {
		writeJSON(w, http.StatusBadRequest, map[string]string{"error": "invalid role (owner cannot be invited)"})
		return
	}
	wsID := strings.TrimSpace(req.WorkspaceID)
	email := strings.ToLower(strings.TrimSpace(req.Email))
	if wsID == "" || email == "" {
		writeJSON(w, http.StatusBadRequest, map[string]string{"error": "workspace_id and email are required"})
		return
	}

	s.mu.Lock()
	defer s.mu.Unlock()
	if !s.hasPermissionLocked(actor.ID, wsID, "workspace.access.manage") {
		writeJSON(w, http.StatusForbidden, map[string]string{"error": "missing permission: workspace.access.manage"})
		return
	}
	actorRole := s.workspaceMembers[wsID][actor.ID]
	if actorRole != RoleOwner && actorRole != RoleAdmin {
		writeJSON(w, http.StatusForbidden, map[string]string{"error": "only owners and admins can invite"})
		return
	}
	for uid := range s.workspaceMembers[wsID] {
		mu := s.findUserByIDLocked(uid)
		if strings.ToLower(mu.Email) == email {
			writeJSON(w, http.StatusConflict, map[string]string{"error": "that email is already a member of this workspace"})
			return
		}
	}
	perms, ok := normalizeMemberPermissionOverride(role, req.Permissions)
	if !ok {
		writeJSON(w, http.StatusBadRequest, map[string]string{"error": "permissions must be a subset of the selected role"})
		return
	}
	if perms == nil {
		perms = append([]string(nil), permissionsForRole(role)...)
		sort.Strings(perms)
	}
	token := newToken(24)
	publicID := "inv_" + newToken(8)
	inv := &workspaceInvite{
		PublicID:    publicID,
		Token:       token,
		Email:       email,
		WorkspaceID: wsID,
		Role:        role,
		Permissions: perms,
		InvitedBy:   actor.ID,
		CreatedAt:   time.Now(),
	}
	s.removePendingInvitesForEmailLocked(wsID, email)
	s.workspaceInvites = append(s.workspaceInvites, inv)
	s.inviteByToken[token] = inv

	ws := s.findWorkspaceByIDForAnyUserLocked(wsID)
	sendInviteEmail(email, token, ws.Name, actor.FullName)

	writeJSON(w, http.StatusCreated, map[string]any{
		"status":    "invited",
		"id":        publicID,
		"email":     email,
		"role":      string(role),
		"sent_email": strings.TrimSpace(os.Getenv("SMTP_HOST")) != "",
	})
}

func (s *AuthService) removePendingInvitesForEmailLocked(workspaceID, email string) {
	email = strings.ToLower(strings.TrimSpace(email))
	filtered := s.workspaceInvites[:0]
	for _, inv := range s.workspaceInvites {
		if inv.WorkspaceID == workspaceID && strings.ToLower(inv.Email) == email {
			delete(s.inviteByToken, inv.Token)
			continue
		}
		filtered = append(filtered, inv)
	}
	s.workspaceInvites = filtered
}

func (s *AuthService) listWorkspaceInvites(w http.ResponseWriter, r *http.Request, actor User) {
	wsID := strings.TrimSpace(r.URL.Query().Get("workspace_id"))
	if wsID == "" {
		writeJSON(w, http.StatusBadRequest, map[string]string{"error": "workspace_id is required"})
		return
	}
	s.mu.RLock()
	members := s.workspaceMembers[wsID]
	if members[actor.ID] == "" {
		s.mu.RUnlock()
		writeJSON(w, http.StatusForbidden, map[string]string{"error": "workspace access denied"})
		return
	}
	if !s.hasPermissionLocked(actor.ID, wsID, "workspace.access.manage") {
		s.mu.RUnlock()
		writeJSON(w, http.StatusForbidden, map[string]string{"error": "missing permission: workspace.access.manage"})
		return
	}
	out := []map[string]any{}
	for _, inv := range s.workspaceInvites {
		if inv.WorkspaceID != wsID {
			continue
		}
		out = append(out, map[string]any{
			"id": inv.PublicID, "email": inv.Email, "role": string(inv.Role),
			"permissions": inv.Permissions, "created_at": inv.CreatedAt,
		})
	}
	s.mu.RUnlock()
	writeJSON(w, http.StatusOK, map[string]any{"items": out})
}

func (s *AuthService) deleteWorkspaceInvite(w http.ResponseWriter, r *http.Request, actor User) {
	wsID := strings.TrimSpace(r.URL.Query().Get("workspace_id"))
	inviteID := strings.TrimSpace(r.URL.Query().Get("invite_id"))
	if wsID == "" || inviteID == "" {
		writeJSON(w, http.StatusBadRequest, map[string]string{"error": "workspace_id and invite_id are required"})
		return
	}
	s.mu.Lock()
	defer s.mu.Unlock()
	if !s.hasPermissionLocked(actor.ID, wsID, "workspace.access.manage") {
		writeJSON(w, http.StatusForbidden, map[string]string{"error": "missing permission: workspace.access.manage"})
		return
	}
	found := false
	filtered := s.workspaceInvites[:0]
	for _, inv := range s.workspaceInvites {
		if inv.WorkspaceID == wsID && inv.PublicID == inviteID {
			delete(s.inviteByToken, inv.Token)
			found = true
			continue
		}
		filtered = append(filtered, inv)
	}
	s.workspaceInvites = filtered
	if !found {
		writeJSON(w, http.StatusNotFound, map[string]string{"error": "invite not found"})
		return
	}
	writeJSON(w, http.StatusOK, map[string]string{"status": "cancelled"})
}

func (s *AuthService) invitePreview(w http.ResponseWriter, r *http.Request) {
	if r.Method != http.MethodGet {
		methodNotAllowed(w)
		return
	}
	token := strings.TrimSpace(r.URL.Query().Get("token"))
	if token == "" {
		writeJSON(w, http.StatusBadRequest, map[string]string{"error": "token is required"})
		return
	}
	s.mu.RLock()
	inv, ok := s.inviteByToken[token]
	var ws Workspace
	if ok && inv != nil {
		ws = s.findWorkspaceByIDForAnyUserLocked(inv.WorkspaceID)
	}
	s.mu.RUnlock()
	if !ok || inv == nil {
		writeJSON(w, http.StatusNotFound, map[string]string{"error": "invite not found or expired"})
		return
	}
	writeJSON(w, http.StatusOK, map[string]any{
		"email":          inv.Email,
		"workspace_id":   inv.WorkspaceID,
		"workspace_name": ws.Name,
		"role":           string(inv.Role),
		"permissions":    inv.Permissions,
	})
}

type inviteAcceptRequest struct {
	Token     string `json:"token"`
	FullName  string `json:"full_name"`
	Password  string `json:"password"`
	Company   string `json:"company"`
	PlanID    string `json:"plan_id"`
	StartTrial bool  `json:"start_trial"`
}

func (s *AuthService) inviteAccept(w http.ResponseWriter, r *http.Request) {
	if r.Method != http.MethodPost {
		methodNotAllowed(w)
		return
	}
	var req inviteAcceptRequest
	if !decodeJSON(w, r, &req) {
		return
	}
	token := strings.TrimSpace(req.Token)
	if token == "" {
		writeJSON(w, http.StatusBadRequest, map[string]string{"error": "token is required"})
		return
	}

	bearer := bearerToken(r)

	s.mu.Lock()
	defer s.mu.Unlock()

	inv, ok := s.inviteByToken[token]
	if !ok || inv == nil {
		writeJSON(w, http.StatusNotFound, map[string]string{"error": "invite not found or expired"})
		return
	}

	if bearer != "" {
		sess, exists := s.sessions[bearer]
		if !exists || sess.ExpiresAt.Before(time.Now()) {
			writeJSON(w, http.StatusUnauthorized, map[string]string{"error": "invalid session"})
			return
		}
		u := s.findUserByIDLocked(sess.UserID)
		if strings.ToLower(u.Email) != inv.Email {
			writeJSON(w, http.StatusForbidden, map[string]string{"error": "signed-in user does not match invite email"})
			return
		}
		s.attachUserToInvitedWorkspaceLocked(u, inv)
		maxMin := sessionMaxAgeMinutes(u.WorkspaceID)
		tok2, session := s.issueSession(u.ID, maxMin)
		s.sessions[tok2] = session
		u = s.users[strings.ToLower(u.Email)]
		writeJSON(w, http.StatusOK, map[string]any{"token": tok2, "user": s.sanitizeUserLocked(u), "session": session})
		return
	}

	if _, exists := s.users[inv.Email]; exists {
		writeJSON(w, http.StatusConflict, map[string]string{"error": "account_exists", "message": "Sign in with this email, then open the invite link again while logged in."})
		return
	}
	if strings.TrimSpace(req.FullName) == "" || strings.TrimSpace(req.Password) == "" {
		writeJSON(w, http.StatusBadRequest, map[string]string{"error": "full_name and password are required"})
		return
	}
	if len(strings.TrimSpace(req.Password)) < 8 {
		writeJSON(w, http.StatusBadRequest, map[string]string{"error": "password must be at least 8 characters"})
		return
	}

	ws := s.findWorkspaceByIDForAnyUserLocked(inv.WorkspaceID)
	if ws.ID == "" {
		writeJSON(w, http.StatusBadRequest, map[string]string{"error": "workspace no longer exists"})
		return
	}

	ownerPlan := "starter"
	for uid, rrole := range s.workspaceMembers[inv.WorkspaceID] {
		if rrole == RoleOwner {
			ou := s.findUserByIDLocked(uid)
			if ou.Plan != "" {
				ownerPlan = ou.Plan
			}
			break
		}
	}

	newUser := User{
		ID:                "user-" + newToken(8),
		Email:             inv.Email,
		FullName:          strings.TrimSpace(req.FullName),
		PasswordHash:      hashPassword(req.Password),
		Role:              "member",
		Company:           strings.TrimSpace(req.Company),
		WorkspaceID:       ws.ID,
		WorkspaceSlug:     ws.Slug,
		WorkspaceName:     ws.Name,
		Plan:              firstNonEmpty(strings.TrimSpace(req.PlanID), ownerPlan),
		TrialStatus:       "inactive",
		SubscriptionState: "inactive",
	}
	if req.StartTrial {
		days := s.planTrialDays(newUser.Plan)
		if days == 0 {
			days = 14
		}
		end := time.Now().Add(time.Duration(days) * 24 * time.Hour)
		newUser.TrialStatus = "active"
		newUser.SubscriptionState = "trialing"
		newUser.TrialEndsAt = &end
	}

	s.users[inv.Email] = newUser
	wsCopy := ws
	wsCopy.Role = string(inv.Role)
	s.workspaceByUser[newUser.ID] = []Workspace{wsCopy}
	if s.workspaceMembers[inv.WorkspaceID] == nil {
		s.workspaceMembers[inv.WorkspaceID] = map[string]WorkspaceRole{}
	}
	s.workspaceMembers[inv.WorkspaceID][newUser.ID] = inv.Role
	override, ok := normalizeMemberPermissionOverride(inv.Role, inv.Permissions)
	if ok && len(override) > 0 {
		s.applyPermissionOverrideLocked(inv.WorkspaceID, newUser.ID, override)
	}

	s.removeInviteByTokenLocked(token)

	maxMin := sessionMaxAgeMinutes(newUser.WorkspaceID)
	tok2, session := s.issueSession(newUser.ID, maxMin)
	s.sessions[tok2] = session

	writeJSON(w, http.StatusCreated, map[string]any{
		"token":   tok2,
		"user":    s.sanitizeUserLocked(newUser),
		"session": session,
	})
}

func (s *AuthService) attachUserToInvitedWorkspaceLocked(u User, inv *workspaceInvite) {
	ws := s.findWorkspaceByIDForAnyUserLocked(inv.WorkspaceID)
	if ws.ID == "" {
		return
	}
	if s.workspaceMembers[inv.WorkspaceID] == nil {
		s.workspaceMembers[inv.WorkspaceID] = map[string]WorkspaceRole{}
	}
	s.workspaceMembers[inv.WorkspaceID][u.ID] = inv.Role
	override, ok := normalizeMemberPermissionOverride(inv.Role, inv.Permissions)
	if ok && len(override) > 0 {
		s.applyPermissionOverrideLocked(inv.WorkspaceID, u.ID, override)
	} else {
		s.applyPermissionOverrideLocked(inv.WorkspaceID, u.ID, nil)
	}
	if !userHasWorkspaceLocked(s.workspaceByUser[u.ID], inv.WorkspaceID) {
		wsCopy := ws
		wsCopy.Role = string(inv.Role)
		s.workspaceByUser[u.ID] = append([]Workspace{wsCopy}, s.workspaceByUser[u.ID]...)
	}
	u.WorkspaceID = inv.WorkspaceID
	u.WorkspaceSlug = ws.Slug
	u.WorkspaceName = ws.Name
	s.users[strings.ToLower(u.Email)] = u
	s.removeInviteByTokenLocked(inv.Token)
}

func (s *AuthService) removeInviteByTokenLocked(token string) {
	filtered := s.workspaceInvites[:0]
	for _, inv := range s.workspaceInvites {
		if inv.Token == token {
			delete(s.inviteByToken, token)
			continue
		}
		filtered = append(filtered, inv)
	}
	s.workspaceInvites = filtered
}

func intToString(value int) string {
	return strconv.Itoa(value)
}
