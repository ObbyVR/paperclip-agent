#!/usr/bin/env npx tsx
/**
 * Send email via Resend API.
 * Used by CEO agent or specialist agents to contact prospects.
 *
 * Usage:
 *   npx tsx scripts/send-email.ts \
 *     --to recipient@example.com \
 *     --template audit \
 *     --vars '{"nome":"Mario","sito":"example.com","report":"..."}' \
 *     [--subject "Custom subject"] \
 *     [--attach /path/to/file.html] \
 *     [--from "Nome Agenzia <noreply@yourdomain.com>"]
 *
 * Templates: audit, redesign (in scripts/email-templates/)
 *
 * Environment:
 *   RESEND_API_KEY  — required, from .env or env
 *   EMAIL_FROM      — default sender address (fallback)
 */
import * as fs from "fs";
import * as path from "path";
import { fileURLToPath } from "url";

const __dirname = path.dirname(fileURLToPath(import.meta.url));

// ── Arg parsing ──────────────────────────────────────────────────

function parseArgs(argv: string[]): Record<string, string> {
  const args: Record<string, string> = {};
  for (let i = 2; i < argv.length; i++) {
    const key = argv[i];
    if (key.startsWith("--") && i + 1 < argv.length) {
      args[key.slice(2)] = argv[++i];
    }
  }
  return args;
}

// ── Template engine (Mustache-lite) ──────────────────────────────

function renderTemplate(html: string, vars: Record<string, string>): string {
  return html.replace(/\{\{(\w+)\}\}/g, (_, key) => vars[key] ?? "");
}

// ── Main ─────────────────────────────────────────────────────────

async function main() {
  const args = parseArgs(process.argv);

  // Validate required args
  if (!args.to) {
    console.error("Error: --to is required");
    console.error("Usage: npx tsx scripts/send-email.ts --to email --template audit --vars '{}'");
    process.exit(1);
  }

  if (!args.template && !args.subject) {
    console.error("Error: --template or --subject is required");
    process.exit(1);
  }

  // Load API key
  const apiKey = process.env.RESEND_API_KEY;
  if (!apiKey) {
    console.error("Error: RESEND_API_KEY not set in environment");
    console.error("Set it in .env or export RESEND_API_KEY=re_...");
    process.exit(1);
  }

  // Parse template vars
  let vars: Record<string, string> = {};
  if (args.vars) {
    try {
      vars = JSON.parse(args.vars);
    } catch {
      console.error("Error: --vars must be valid JSON");
      process.exit(1);
    }
  }

  // Load template if specified
  let subject = args.subject ?? "";
  let htmlBody = "";

  if (args.template) {
    const templatePath = path.join(__dirname, "email-templates", `${args.template}.html`);
    if (!fs.existsSync(templatePath)) {
      console.error(`Error: Template not found: ${templatePath}`);
      console.error("Available templates: audit, redesign");
      process.exit(1);
    }
    const raw = fs.readFileSync(templatePath, "utf-8");

    // Extract subject from template <!-- subject: ... --> comment
    const subjectMatch = raw.match(/<!--\s*subject:\s*(.+?)\s*-->/);
    if (subjectMatch && !args.subject) {
      subject = renderTemplate(subjectMatch[1], vars);
    }

    htmlBody = renderTemplate(raw, vars);
  }

  // Sender address
  const from = args.from ?? process.env.EMAIL_FROM ?? "WebAgency AI <onboarding@resend.dev>";

  // Prepare attachments
  const attachments: Array<{ filename: string; content: string }> = [];
  if (args.attach) {
    const attachPath = path.resolve(args.attach);
    if (!fs.existsSync(attachPath)) {
      console.error(`Error: Attachment not found: ${attachPath}`);
      process.exit(1);
    }
    const content = fs.readFileSync(attachPath);
    attachments.push({
      filename: path.basename(attachPath),
      content: content.toString("base64"),
    });
  }

  // Send via Resend API (direct fetch, no SDK dependency needed)
  const payload: Record<string, unknown> = {
    from,
    to: [args.to],
    subject,
    html: htmlBody,
  };

  if (attachments.length > 0) {
    payload.attachments = attachments;
  }

  try {
    const res = await fetch("https://api.resend.com/emails", {
      method: "POST",
      headers: {
        "Authorization": `Bearer ${apiKey}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify(payload),
    });

    const data = await res.json();

    if (!res.ok) {
      console.error(`Resend API error (${res.status}):`, JSON.stringify(data, null, 2));
      process.exit(1);
    }

    console.log(`Email sent successfully to ${args.to}`);
    console.log(`ID: ${(data as { id: string }).id}`);
  } catch (err) {
    console.error("Failed to send email:", err);
    process.exit(1);
  }
}

main();
