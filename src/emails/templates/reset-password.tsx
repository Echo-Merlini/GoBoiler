import {
  Body,
  Button,
  Container,
  Head,
  Heading,
  Html,
  Preview,
  Text,
} from "@react-email/components";

export function ResetPasswordEmail({ link }: { link: string }) {
  return (
    <Html>
      <Head />
      <Preview>Reset your password</Preview>
      <Body style={{ fontFamily: "sans-serif", background: "#f4f4f5" }}>
        <Container style={{ maxWidth: 560, margin: "40px auto", background: "#fff", borderRadius: 8, padding: 32 }}>
          <Heading style={{ fontSize: 24, marginBottom: 8 }}>Reset your password</Heading>
          <Text style={{ color: "#52525b" }}>
            Click the button below to set a new password. This link expires in 1 hour.
          </Text>
          <Button
            href={link}
            style={{ background: "#18181b", color: "#fff", padding: "12px 24px", borderRadius: 6, marginTop: 16 }}
          >
            Reset password
          </Button>
          <Text style={{ color: "#a1a1aa", fontSize: 12, marginTop: 24 }}>
            If you didn't request a password reset, you can safely ignore this email.
          </Text>
        </Container>
      </Body>
    </Html>
  );
}
