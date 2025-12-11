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

interface ExecutionFailureEmailProps {
  userName: string;
  workflowName: string;
  executionId: string;
  startedAt: string;
  failedAt: string;
  errorMessage: string;
  appUrl: string;
}

export function ExecutionFailureEmail({
  userName = "User",
  workflowName = "Workflow",
  executionId = "12345",
  startedAt = "Dec 11, 2025 at 10:00 AM",
  failedAt = "Dec 11, 2025 at 10:05 AM",
  errorMessage = "An unexpected error occurred",
  appUrl = "https://anthem.agency",
}: ExecutionFailureEmailProps) {
  const executionUrl = `${appUrl}/executions/${executionId}`;

  return (
    <Html>
      <Head />
      <Preview>{`Your workflow "${workflowName}" failed to complete`}</Preview>
      <Body style={main}>
        <Container style={container}>
          {/* Error Banner */}
          <Section style={errorBanner}>
            <div style={errorIcon}>✕</div>
            <Heading style={errorHeading}>Execution Failed</Heading>
          </Section>

          {/* Main Content */}
          <Section style={content}>
            <Text style={greeting}>Hi {userName},</Text>
            <Text style={paragraph}>
              Unfortunately, your workflow <strong>{workflowName}</strong>{" "}
              encountered an error and could not complete successfully.
            </Text>

            {/* Error Message Card */}
            <Section style={errorCard}>
              <Text style={errorCardTitle}>Error Message</Text>
              <Text style={errorCardMessage}>{errorMessage}</Text>
            </Section>

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
                    <td style={detailLabel}>Failed</td>
                    <td style={detailValue}>{failedAt}</td>
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
              You can view more details about this error and the execution
              timeline from the execution details page. If you need assistance,
              please contact our support team.
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

export default ExecutionFailureEmail;

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

const errorBanner: React.CSSProperties = {
  backgroundColor: "#fef2f2",
  padding: "32px",
  textAlign: "center" as const,
  borderBottom: "1px solid #fecaca",
};

const errorIcon: React.CSSProperties = {
  width: "48px",
  height: "48px",
  backgroundColor: "#ef4444",
  borderRadius: "50%",
  color: "#ffffff",
  fontSize: "24px",
  fontWeight: "bold",
  lineHeight: "48px",
  margin: "0 auto 16px",
};

const errorHeading: React.CSSProperties = {
  color: "#991b1b",
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

const errorCard: React.CSSProperties = {
  backgroundColor: "#fef2f2",
  borderRadius: "8px",
  border: "1px solid #fecaca",
  padding: "16px 20px",
  marginBottom: "24px",
};

const errorCardTitle: React.CSSProperties = {
  color: "#991b1b",
  fontSize: "12px",
  fontWeight: "600",
  margin: "0 0 8px",
  textTransform: "uppercase" as const,
  letterSpacing: "0.5px",
};

const errorCardMessage: React.CSSProperties = {
  color: "#dc2626",
  fontSize: "14px",
  fontFamily: "monospace",
  lineHeight: "20px",
  margin: "0",
  wordBreak: "break-word" as const,
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
