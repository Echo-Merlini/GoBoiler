import {
  Body,
  Button,
  Container,
  Head,
  Heading,
  Html,
  Preview,
  Section,
  Text,
} from "@react-email/components";

export function WelcomeEmail({ name }: { name: string }) {
  return (
    <Html>
      <Head />
      <Preview>Welcome to GoBoiler, {name}!</Preview>
      <Body style={{ fontFamily: "sans-serif", background: "#f4f4f5" }}>
        <Container style={{ maxWidth: 560, margin: "40px auto", background: "#fff", borderRadius: 8, padding: 32 }}>
          <Heading style={{ fontSize: 24, marginBottom: 8 }}>Welcome, {name} 👋</Heading>
          <Text style={{ color: "#52525b" }}>
            Your account is ready. Jump in and explore.
          </Text>
          <Section style={{ marginTop: 24 }}>
            <Button
              href={process.env.APP_URL}
              style={{ background: "#18181b", color: "#fff", padding: "12px 24px", borderRadius: 6 }}
            >
              Get started
            </Button>
          </Section>
        </Container>
      </Body>
    </Html>
  );
}
