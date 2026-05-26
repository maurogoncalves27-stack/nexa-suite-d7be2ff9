/// <reference types="npm:@types/react@18.3.1" />
import * as React from 'npm:react@18.3.1'
import {
  Body, Container, Head, Heading, Html, Preview, Text,
} from 'npm:@react-email/components@0.0.22'
import type { TemplateEntry } from './registry.ts'

const SITE_NAME = 'NEXA'

interface TestEmailProps {
  name?: string
}

const TestEmail = ({ name }: TestEmailProps) => (
  <Html lang="pt-BR" dir="ltr">
    <Head />
    <Preview>E-mail de teste do {SITE_NAME}</Preview>
    <Body style={main}>
      <Container style={container}>
        <Heading style={h1}>
          {name ? `Olá, ${name}!` : 'Olá!'}
        </Heading>
        <Text style={text}>
          Este é um e-mail de teste enviado pelo {SITE_NAME} para confirmar que
          a infraestrutura de envio está funcionando corretamente.
        </Text>
        <Text style={footer}>— Equipe {SITE_NAME}</Text>
      </Container>
    </Body>
  </Html>
)

export const template = {
  component: TestEmail,
  subject: `E-mail de teste — ${SITE_NAME}`,
  displayName: 'E-mail de teste',
  previewData: { name: 'Mauro' },
} satisfies TemplateEntry

const main = { backgroundColor: '#ffffff', fontFamily: 'Arial, sans-serif' }
const container = { padding: '20px 25px', maxWidth: '560px' }
const h1 = { fontSize: '22px', fontWeight: 'bold', color: '#0f172a', margin: '0 0 20px' }
const text = { fontSize: '14px', color: '#475569', lineHeight: '1.6', margin: '0 0 25px' }
const footer = { fontSize: '12px', color: '#94a3b8', margin: '30px 0 0' }
