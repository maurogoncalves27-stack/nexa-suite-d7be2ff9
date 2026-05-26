/// <reference types="npm:@types/react@18.3.1" />
import * as React from 'npm:react@18.3.1'
import {
  Body, Button, Container, Head, Heading, Hr, Html, Preview, Section, Text,
} from 'npm:@react-email/components@0.0.22'
import type { TemplateEntry } from './registry.ts'

const SITE_NAME = 'NEXA'

interface Props {
  name?: string
  jobTitle?: string
  uploadUrl?: string
  documents?: string[]
  notes?: string
}

const DocumentsRequest = ({ name, jobTitle, uploadUrl, documents = [], notes }: Props) => (
  <Html lang="pt-BR" dir="ltr">
    <Head />
    <Preview>Envie seus documentos para darmos sequência ao processo seletivo</Preview>
    <Body style={main}>
      <Container style={container}>
        <Heading style={h1}>
          {name ? `Olá, ${name}!` : 'Olá!'}
        </Heading>
        <Text style={text}>
          Para darmos sequência ao seu processo seletivo
          {jobTitle ? ` para a vaga de ${jobTitle}` : ''}, precisamos que você envie
          alguns documentos. Preparamos uma página exclusiva onde você pode
          enviar tudo de forma rápida e segura — sem precisar criar conta.
        </Text>

        <Section style={ctaWrap}>
          {uploadUrl && (
            <Button href={uploadUrl} style={button}>Enviar meus documentos</Button>
          )}
          {uploadUrl && (
            <Text style={linkFallback}>
              Ou copie e cole este link no navegador:<br />
              <span style={linkText}>{uploadUrl}</span>
            </Text>
          )}
        </Section>

        {documents.length > 0 && (
          <Section style={card}>
            <Text style={cardLabel}>📄 Documentos solicitados</Text>
            {documents.map((d, i) => (
              <Text key={i} style={cardItem}>• {d}</Text>
            ))}
          </Section>
        )}

        {notes && (
          <>
            <Hr style={hr} />
            <Text style={cardLabel}>Observações</Text>
            <Text style={text}>{notes}</Text>
          </>
        )}

        <Heading style={h2}>Dicas para o envio</Heading>
        <Text style={text}>
          • Tire fotos com boa iluminação ou envie PDFs nítidos.<br />
          • Confira se o documento está totalmente visível.<br />
          • Você pode enviar de qualquer dispositivo (celular ou computador).<br />
          • Se faltar algum documento, é possível voltar à página e enviar depois.
        </Text>

        <Text style={text}>
          ⚠️ <strong>Importante:</strong> caso este e-mail tenha caído na sua caixa
          de spam ou lixo eletrônico, marque-o como "não é spam" para receber
          os próximos comunicados normalmente.
        </Text>

        <Text style={footer}>
          Qualquer dúvida, é só responder este e-mail.<br />
          Equipe {SITE_NAME}
        </Text>
      </Container>
    </Body>
  </Html>
)

export const template = {
  component: DocumentsRequest,
  subject: (data: Record<string, any>) =>
    `Envio de documentos${data?.jobTitle ? ` — vaga de ${data.jobTitle}` : ''} — ${SITE_NAME}`,
  displayName: 'Solicitação de documentos',
  previewData: {
    name: 'Maria',
    jobTitle: 'Atendente',
    uploadUrl: 'https://nexa.aquelaparme.com.br/enviar-documentos/abc-123',
    documents: ['RG (frente e verso)', 'CPF', 'Comprovante de residência'],
    notes: 'Traga os originais no dia da entrevista presencial.',
  },
} satisfies TemplateEntry

const main = { backgroundColor: '#ffffff', fontFamily: 'Arial, sans-serif' }
const container = { padding: '20px 25px', maxWidth: '560px' }
const h1 = { fontSize: '22px', fontWeight: 'bold', color: '#0f172a', margin: '0 0 20px' }
const h2 = { fontSize: '16px', fontWeight: 'bold', color: '#0f172a', margin: '24px 0 12px' }
const text = { fontSize: '14px', color: '#475569', lineHeight: '1.6', margin: '0 0 18px' }
const ctaWrap = { textAlign: 'center' as const, margin: '24px 0' }
const button = {
  backgroundColor: '#0f172a',
  color: '#ffffff',
  padding: '12px 22px',
  borderRadius: '6px',
  fontSize: '14px',
  fontWeight: 'bold',
  textDecoration: 'none',
  display: 'inline-block',
}
const linkFallback = { fontSize: '12px', color: '#94a3b8', margin: '14px 0 0', lineHeight: '1.6' }
const linkText = { color: '#0f172a', wordBreak: 'break-all' as const }
const card = {
  backgroundColor: '#f8fafc',
  border: '1px solid #e2e8f0',
  borderRadius: '8px',
  padding: '16px 20px',
  margin: '8px 0 24px',
}
const cardLabel = { fontSize: '12px', color: '#64748b', margin: '0 0 8px', textTransform: 'uppercase' as const, letterSpacing: '0.04em', fontWeight: 'bold' }
const cardItem = { fontSize: '14px', color: '#0f172a', margin: '0 0 6px', lineHeight: '1.5' }
const hr = { borderColor: '#e2e8f0', margin: '12px 0' }
const footer = { fontSize: '12px', color: '#94a3b8', margin: '30px 0 0', lineHeight: '1.6' }
