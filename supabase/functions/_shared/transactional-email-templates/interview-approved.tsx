/// <reference types="npm:@types/react@18.3.1" />
import * as React from 'npm:react@18.3.1'
import {
  Body, Button, Container, Head, Heading, Hr, Html, Link, Preview, Section, Text,
} from 'npm:@react-email/components@0.0.22'
import type { TemplateEntry } from './registry.ts'

const SITE_NAME = 'NEXA'

interface Props {
  name?: string
  jobTitle?: string
  interviewDate?: string // formatted string already
  locationName?: string
  locationAddress?: string
  mapsUrl?: string
}

const InterviewApproved = ({
  name, jobTitle, interviewDate, locationName, locationAddress, mapsUrl,
}: Props) => (
  <Html lang="pt-BR" dir="ltr">
    <Head />
    <Preview>Sua entrevista{jobTitle ? ` para ${jobTitle}` : ''} foi confirmada</Preview>
    <Body style={main}>
      <Container style={container}>
        <Heading style={h1}>
          {name ? `Boas notícias, ${name}!` : 'Boas notícias!'}
        </Heading>
        <Text style={text}>
          Ficamos felizes em informar que sua candidatura{jobTitle ? ` para a vaga de ${jobTitle}` : ''} foi
          aprovada para a próxima etapa: a <strong>entrevista presencial</strong>.
        </Text>

        <Section style={card}>
          <Text style={cardLabel}>📅 Data e horário</Text>
          <Text style={cardValue}>{interviewDate || 'Em breve nossa equipe entrará em contato para confirmar o horário.'}</Text>

          {(locationName || locationAddress) && (
            <>
              <Hr style={hr} />
              <Text style={cardLabel}>📍 Local</Text>
              {locationName && <Text style={cardValue}>{locationName}</Text>}
              {locationAddress && <Text style={cardValueSecondary}>{locationAddress}</Text>}
              {mapsUrl && (
                <Button href={mapsUrl} style={button}>Ver no Google Maps</Button>
              )}
            </>
          )}
        </Section>

        <Heading style={h2}>Como se preparar</Heading>
        <Text style={text}>
          • Chegue com <strong>10 minutos de antecedência</strong>.<br />
          • Leve um <strong>documento com foto</strong> (RG ou CNH).<br />
          • Vista-se de forma confortável e apresentável.<br />
          • Tenha em mãos uma cópia atualizada do seu currículo.<br />
          • Esteja pronto para falar um pouco sobre você e suas experiências.
        </Text>

        <Text style={text}>
          Se por qualquer motivo você não puder comparecer, por favor, nos avise
          com antecedência respondendo a este e-mail ou pelo WhatsApp.
        </Text>

        <Text style={text}>
          Estamos ansiosos para te conhecer! 🙌
        </Text>

        <Text style={footer}>
          Até breve,<br />Equipe {SITE_NAME}
        </Text>
      </Container>
    </Body>
  </Html>
)

export const template = {
  component: InterviewApproved,
  subject: (data: Record<string, any>) =>
    `Sua entrevista${data?.jobTitle ? ` para ${data.jobTitle}` : ''} está confirmada — ${SITE_NAME}`,
  displayName: 'Entrevista aprovada',
  previewData: {
    name: 'Maria',
    jobTitle: 'Atendente',
    interviewDate: 'Terça-feira, 28 de abril de 2026 às 09:00',
    locationName: 'Loja Centro',
    locationAddress: 'Av. Brasil, 1000 — Brasília/DF',
    mapsUrl: 'https://www.google.com/maps/search/?api=1&query=Av.+Brasil+1000+Brasilia',
  },
} satisfies TemplateEntry

const main = { backgroundColor: '#ffffff', fontFamily: 'Arial, sans-serif' }
const container = { padding: '20px 25px', maxWidth: '560px' }
const h1 = { fontSize: '22px', fontWeight: 'bold', color: '#0f172a', margin: '0 0 20px' }
const h2 = { fontSize: '16px', fontWeight: 'bold', color: '#0f172a', margin: '24px 0 12px' }
const text = { fontSize: '14px', color: '#475569', lineHeight: '1.6', margin: '0 0 18px' }
const card = {
  backgroundColor: '#f8fafc',
  border: '1px solid #e2e8f0',
  borderRadius: '8px',
  padding: '16px 20px',
  margin: '8px 0 24px',
}
const cardLabel = { fontSize: '12px', color: '#64748b', margin: '0 0 4px', textTransform: 'uppercase' as const, letterSpacing: '0.04em', fontWeight: 'bold' }
const cardValue = { fontSize: '15px', color: '#0f172a', margin: '0 0 8px', fontWeight: 'bold' }
const cardValueSecondary = { fontSize: '14px', color: '#475569', margin: '0 0 12px' }
const hr = { borderColor: '#e2e8f0', margin: '12px 0' }
const button = {
  backgroundColor: '#0f172a',
  color: '#ffffff',
  padding: '10px 18px',
  borderRadius: '6px',
  fontSize: '13px',
  fontWeight: 'bold',
  textDecoration: 'none',
  display: 'inline-block',
  marginTop: '4px',
}
const footer = { fontSize: '12px', color: '#94a3b8', margin: '30px 0 0', lineHeight: '1.6' }
