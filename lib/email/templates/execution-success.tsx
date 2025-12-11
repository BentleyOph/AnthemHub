import {
  Body,
  Button,
  Container,
  Head,
  Heading,
  Hr,
  Html,
  Link,
  Preview,
  Section,
  Text,
} from "@react-email/components";
import * as React from "react";

interface ExecutionSuccessEmailProps {
  userName: string;
  workflowName: string;
  executionId: string;
  startedAt: string;
  finishedAt: string;
  duration: string;
  appUrl: string;
}

export function ExecutionSuccessEmail({
  userName = "User",
  workflowName = "Workflow",
  executionId = "12345",
  startedAt = "Dec 11, 2025 at 10:00 AM",
  finishedAt = "Dec 11, 2025 at 10:05 AM",
  duration = "5 minutes",
  appUrl = "https://anthem.agency",
}: ExecutionSuccessEmailProps) {
  const executionUrl = `${appUrl}/executions/${executionId}`;

  return (
    <Html>
      <Head />
      <Preview>{`Your workflow "${workflowName}" completed successfully`}</Preview>
      <Body style={main}>
        <Container style={container}>
          {/* Success Banner */}
          <Section style={successBanner}>
            <div style={successIcon}>✓</div>
            <Heading style={successHeading}>Execution Completed</Heading>
          </Section>

          {/* Main Content */}
          <Section style={content}>
            <Text style={greeting}>Hi {userName},</Text>
            <Text style={paragraph}>
              Great news! Your workflow <strong>{workflowName}</strong> has
              completed successfully.
            </Text>

            {/* Execution Details Card */}
            <Section style={detailsCard}>
              <Text style={detailsTitle}>Execution Details</Text>
              <Hr style={detailsDivider} />
              <table style={detailsTable}>
                <tbody>
                  <tr>
                    <td style={detailLabel}>Workflow</td>
                    <td style={detailValue}>{workflowName}</td>
                  </tr>
                  <tr>
                    <td style={detailLabel}>Execution ID</td>
                    <td style={detailValueMono}>{executionId.slice(0, 8)}...</td>
                  </tr>
                  <tr>
                    <td style={detailLabel}>Started</td>
                    <td style={detailValue}>{startedAt}</td>
                  </tr>
                  <tr>
                    <td style={detailLabel}>Completed</td>
                    <td style={detailValue}>{finishedAt}</td>
                  </tr>
                  <tr>
                    <td style={detailLabel}>Duration</td>
                    <td style={detailValue}>{duration}</td>
                  </tr>
                </tbody>
              </table>
            </Section>

            {/* CTA Button */}
            <Section style={buttonSection}>
              <Button style={button} href={executionUrl}>
                View Execution Details
              </Button>
            </Section>

            <Text style={paragraph}>
              You can view the full output and download any result files from the
              execution details page.
            </Text>
          </Section>

          {/* Footer */}
          <Hr style={footerDivider} />
          <Section style={footer}>
            <Text style={footerText}>
              This email was sent by{" "}
              <Link href={appUrl} style={footerLink}>
                Anthem
              </Link>
              . You received this because you initiated the workflow execution.
            </Text>
            <Text style={footerCopyright}>
              © {new Date().getFullYear()} Anthem Agency. All rights reserved.
            </Text>
          </Section>
        </Container>
      </Body>
    </Html>
  );
}

export default ExecutionSuccessEmail;

// Styles
const main: React.CSSProperties = {
  backgroundColor: "#f6f9fc",
  fontFamily:
    '-apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, "Helvetica Neue", Ubuntu, sans-serif',
};

const container: React.CSSProperties = {
  backgroundColor: "#ffffff",
  margin: "0 auto",
  padding: "0",
  maxWidth: "600px",
  borderRadius: "8px",
  boxShadow: "0 2px 8px rgba(0, 0, 0, 0.05)",
  overflow: "hidden",
};

const successBanner: React.CSSProperties = {
  backgroundColor: "#ecfdf5",
  padding: "32px",
  textAlign: "center" as const,
  borderBottom: "1px solid #d1fae5",
};

const successIcon: React.CSSProperties = {
  width: "48px",
  height: "48px",
  backgroundColor: "#10b981",
  borderRadius: "50%",
  color: "#ffffff",
  fontSize: "24px",
  fontWeight: "bold",
  lineHeight: "48px",
  margin: "0 auto 16px",
};

const successHeading: React.CSSProperties = {
  color: "#065f46",
  fontSize: "24px",
  fontWeight: "600",
  margin: "0",
};

const content: React.CSSProperties = {
  padding: "32px",
};

const greeting: React.CSSProperties = {
  color: "#18181b",
  fontSize: "16px",
  lineHeight: "24px",
  margin: "0 0 16px",
};

const paragraph: React.CSSProperties = {
  color: "#52525b",
  fontSize: "15px",
  lineHeight: "24px",
  margin: "0 0 24px",
};

const detailsCard: React.CSSProperties = {
  backgroundColor: "#fafafa",
  borderRadius: "8px",
  border: "1px solid #e4e4e7",
  padding: "20px",
  marginBottom: "24px",
};

const detailsTitle: React.CSSProperties = {
  color: "#18181b",
  fontSize: "14px",
  fontWeight: "600",
  margin: "0 0 12px",
  textTransform: "uppercase" as const,
  letterSpacing: "0.5px",
};

const detailsDivider: React.CSSProperties = {
  borderColor: "#e4e4e7",
  margin: "0 0 16px",
};

const detailsTable: React.CSSProperties = {
  width: "100%",
  borderCollapse: "collapse" as const,
};

const detailLabel: React.CSSProperties = {
  color: "#71717a",
  fontSize: "14px",
  padding: "6px 0",
  width: "120px",
  verticalAlign: "top" as const,
};

const detailValue: React.CSSProperties = {
  color: "#18181b",
  fontSize: "14px",
  padding: "6px 0",
  fontWeight: "500",
};

const detailValueMono: React.CSSProperties = {
  ...detailValue,
  fontFamily: "monospace",
  fontSize: "13px",
};

const buttonSection: React.CSSProperties = {
  textAlign: "center" as const,
  marginBottom: "24px",
};

const button: React.CSSProperties = {
  backgroundColor: "#18181b",
  borderRadius: "6px",
  color: "#ffffff",
  fontSize: "15px",
  fontWeight: "600",
  textDecoration: "none",
  textAlign: "center" as const,
  display: "inline-block",
  padding: "12px 24px",
};

const footerDivider: React.CSSProperties = {
  borderColor: "#e4e4e7",
  margin: "0",
};

const footer: React.CSSProperties = {
  backgroundColor: "#fafafa",
  padding: "24px 32px",
  textAlign: "center" as const,
};

const footerText: React.CSSProperties = {
  color: "#71717a",
  fontSize: "13px",
  lineHeight: "20px",
  margin: "0 0 8px",
};

const footerLink: React.CSSProperties = {
  color: "#18181b",
  textDecoration: "underline",
};

const footerCopyright: React.CSSProperties = {
  color: "#a1a1aa",
  fontSize: "12px",
  margin: "0",
};
