package main

import (
	"database/sql"
	"encoding/json"
	"fmt"
	"strings"
	"time"
)

func loadWorkspaceSettingsJSON(db *sql.DB, workspaceID string) (map[string]any, error) {
	var raw string
	err := db.QueryRow(`
		SELECT COALESCE(settings_json::text, '{}')
		FROM workspace_settings
		WHERE workspace_id = $1::uuid
	`, workspaceID).Scan(&raw)
	if err == sql.ErrNoRows {
		return map[string]any{}, nil
	}
	if err != nil {
		return nil, err
	}
	var m map[string]any
	if err := json.Unmarshal([]byte(raw), &m); err != nil {
		return nil, err
	}
	if m == nil {
		m = map[string]any{}
	}
	return m, nil
}

func inMaintenanceWindowUTC(now time.Time, settings map[string]any) bool {
	wd := strings.ToLower(strings.TrimSpace(fmt.Sprint(settings["maintenance_weekday"])))
	startStr := strings.TrimSpace(fmt.Sprint(settings["maintenance_start_time_utc"]))
	durMin := 120
	if v, ok := settings["maintenance_duration_minutes"]; ok {
		switch t := v.(type) {
		case float64:
			durMin = int(t)
		case int:
			durMin = t
		}
	}
	if durMin < 15 {
		durMin = 15
	}
	if durMin > 24*60 {
		durMin = 24 * 60
	}
	if startStr == "" {
		return false
	}
	var hh, mm int
	_, err := fmt.Sscanf(startStr, "%d:%d", &hh, &mm)
	if err != nil || hh < 0 || hh > 23 || mm < 0 || mm > 59 {
		return false
	}
	startMinutes := hh*60 + mm
	endMinutes := startMinutes + durMin

	cur := now.UTC()
	wday := int(cur.Weekday()) // Sunday=0
	if wd != "" && wd != "any" {
		want := weekdayToGo(wd)
		if want >= 0 && wday != want {
			return false
		}
	}
	curMin := cur.Hour()*60 + cur.Minute()
	if endMinutes <= 24*60 {
		return curMin >= startMinutes && curMin < endMinutes
	}
	// window crosses midnight
	return curMin >= startMinutes || curMin < (endMinutes-24*60)
}

func weekdayToGo(name string) int {
	switch strings.ToLower(name) {
	case "sunday":
		return 0
	case "monday":
		return 1
	case "tuesday":
		return 2
	case "wednesday":
		return 3
	case "thursday":
		return 4
	case "friday":
		return 5
	case "saturday":
		return 6
	default:
		return -1
	}
}
