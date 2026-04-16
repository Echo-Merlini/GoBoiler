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

export function MagicLinkEmail({ link }: { link: string }) {
  return (
    <Html>
      <Head />
      <Preview>Your sign-in link (expires in 10 minutes)</Preview>
      <Body style={{ fontFamily: "sans-serif", background: "#f4f4f5" }}>
        <Container style={{ maxWidth: 560, margin: "40px auto", background: "#fff", borderRadius: 8, padding: 32 }}>
          <Heading style={{ fontSize: 24, marginBottom: 8 }}>Sign in</Heading>
          <Text style={{ color: "#52525b" }}>
            Click the button below to sign in. This link expires in 10 minutes and can only be used once.
          </Text>
          <Button
            href={link}
            style={{ background: "#18181b", color: "#fff", padding: "12px 24px", borderRadius: 6, marginTop: 16 }}
          >
            Sign in
          </Button>
          <Text style={{ color: "#a1a1aa", fontSize: 12, marginTop: 24 }}>
            If you didn't request this, you can safely ignore this email.
          </Text>
        </Container>
      </Body>
    </Html>
  );
}
