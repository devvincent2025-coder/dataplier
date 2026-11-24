package main

import (
	"fmt"
	"log"
	"net/smtp"
	"os"
	"strings"
)

// sendInviteEmail queues an invite link. If SMTP is not configured, the message is logged only.
func sendInviteEmail(toEmail, inviteToken, workspaceName, invitedByName string) {
	base := strings.TrimRight(strings.TrimSpace(os.Getenv("FRONTEND_PUBLIC_URL")), "/")
	if base == "" {
		base = "http://localhost:3002"
	}
	link := fmt.Sprintf("%s/signup?invite=%s", base, inviteToken)
	subject := fmt.Sprintf("You're invited to %s on Data Plier", workspaceName)
	body := fmt.Sprintf(
		"You have been invited to join the workspace %q on Data Plier.\n\n"+
			"%s sent this invitation.\n\n"+
			"Open this link to create your account (or, if you already use Data Plier, sign in first and open the same link again to join this workspace):\n%s\n\n"+
			"If you did not expect this email, you can ignore it.\n",
		workspaceName, invitedByName, link,
	)

	host := strings.TrimSpace(os.Getenv("SMTP_HOST"))
	if host == "" {
		log.Printf("invite email (SMTP_HOST unset; not sent): to=%s workspace=%s link=%s", toEmail, workspaceName, link)
		return
	}
	port := strings.TrimSpace(os.Getenv("SMTP_PORT"))
	if port == "" {
		port = "587"
	}
	from := strings.TrimSpace(os.Getenv("SMTP_FROM"))
	if from == "" {
		from = "noreply@dataplier.local"
	}
	user := strings.TrimSpace(os.Getenv("SMTP_USER"))
	pass := strings.TrimSpace(os.Getenv("SMTP_PASS"))

	addr := fmt.Sprintf("%s:%s", host, port)
	msg := []byte(fmt.Sprintf("From: %s\r\nTo: %s\r\nSubject: %s\r\nMIME-Version: 1.0\r\nContent-Type: text/plain; charset=UTF-8\r\n\r\n%s",
		from, toEmail, subject, body))

	var auth smtp.Auth
	if user != "" {
		auth = smtp.PlainAuth("", user, pass, host)
	}
	if err := smtp.SendMail(addr, auth, from, []string{toEmail}, msg); err != nil {
		log.Printf("invite email send failed to=%s err=%v (link=%s)", toEmail, err, link)
		return
	}
	log.Printf("invite email sent to=%s workspace=%s", toEmail, workspaceName)
}
