import {
  Body,
  Button,
  Container,
  Head,
  Heading,
  Html,
  Preview,
  Row,
  Section,
  Text,
} from "@react-email/components";

interface InvoiceEmailProps {
  name: string;
  amount: string;
  invoiceUrl: string;
  date: string;
}

export function InvoiceEmail({ name, amount, invoiceUrl, date }: InvoiceEmailProps) {
  return (
    <Html>
      <Head />
      <Preview>Your invoice for {amount}</Preview>
      <Body style={{ fontFamily: "sans-serif", background: "#f4f4f5" }}>
        <Container style={{ maxWidth: 560, margin: "40px auto", background: "#fff", borderRadius: 8, padding: 32 }}>
          <Heading style={{ fontSize: 24, marginBottom: 8 }}>Invoice</Heading>
          <Text style={{ color: "#52525b" }}>Hi {name}, thank you for your payment.</Text>
          <Section style={{ background: "#f4f4f5", borderRadius: 6, padding: "16px 20px", margin: "24px 0" }}>
            <Row>
              <Text style={{ margin: 0, color: "#71717a", fontSize: 13 }}>Amount</Text>
              <Text style={{ margin: 0, fontWeight: "bold", fontSize: 20 }}>{amount}</Text>
            </Row>
            <Row style={{ marginTop: 12 }}>
              <Text style={{ margin: 0, color: "#71717a", fontSize: 13 }}>Date</Text>
              <Text style={{ margin: 0 }}>{date}</Text>
            </Row>
          </Section>
          <Button
            href={invoiceUrl}
            style={{ background: "#18181b", color: "#fff", padding: "12px 24px", borderRadius: 6 }}
          >
            View invoice
          </Button>
        </Container>
      </Body>
    </Html>
  );
}
