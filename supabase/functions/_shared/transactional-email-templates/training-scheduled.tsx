/// <reference types="npm:@types/react@18.3.1" />
import * as React from 'npm:react@18.3.1'
import {
  Body, Container, Head, Heading, Hr, Html, Preview, Section, Text,
} from 'npm:@react-email/components@0.0.22'
import type { TemplateEntry } from './registry.ts'

const SITE_NAME = 'NEXA'

interface ScheduleDay {
  day_date: string // formatado dd/mm (ex.: "Seg, 28/04")
  is_day_off?: boolean
  start_time?: string | null
  end_time?: string | null
  break_start?: string | null
  break_end?: string | null
  notes?: string | null
}

interface Props {
  name?: string
  jobTitle?: string
  startDate?: string // formatado
  locationName?: string
  responsibleName?: string
  notes?: string
  days?: ScheduleDay[]
}

const TrainingScheduled = ({
  name, jobTitle, startDate, locationName, responsibleName, notes, days,
}: Props) => (
  <Html lang="pt-BR" dir="ltr">
    <Head />
    <Preview>Seu treinamento{startDate ? ` começa em ${startDate}` : ''} — confira os detalhes</Preview>
    <Body style={main}>
      <Container style={container}>
        <Heading style={h1}>
          {name ? `Parabéns, ${name}! 🎉` : 'Parabéns! 🎉'}
        </Heading>
        <Text style={text}>
          Você foi aprovado(a){jobTitle ? ` para a vaga de ${jobTitle}` : ''} e seu
          <strong> treinamento de 7 dias</strong> já está agendado. Abaixo estão todas
          as informações que você precisa para começar.
        </Text>

        <Section style={card}>
          {startDate && (
            <>
              <Text style={cardLabel}>📅 Início do treinamento</Text>
              <Text style={cardValue}>{startDate}</Text>
            </>
          )}
          {locationName && (
            <>
              <Hr style={hr} />
              <Text style={cardLabel}>📍 Local</Text>
              <Text style={cardValue}>{locationName}</Text>
            </>
          )}
          {responsibleName && (
            <>
              <Hr style={hr} />
              <Text style={cardLabel}>👤 Responsável</Text>
              <Text style={cardValue}>{responsibleName}</Text>
            </>
          )}
        </Section>

        {days && days.length > 0 && (
          <>
            <Heading style={h2}>Sua escala</Heading>
            <Section style={scheduleBox}>
              {days.map((d, i) => (
                <div key={i} style={dayRow}>
                  <Text style={dayDate}>{d.day_date}</Text>
                  {d.is_day_off ? (
                    <Text style={dayOff}>Folga</Text>
                  ) : (
                    <Text style={dayHours}>
                      {d.start_time ?? '—'} às {d.end_time ?? '—'}
                      {d.break_start && d.break_end ? ` · intervalo ${d.break_start}–${d.break_end}` : ''}
                    </Text>
                  )}
                  {d.notes && <Text style={dayNotes}>{d.notes}</Text>}
                </div>
              ))}
            </Section>
          </>
        )}

        {notes && (
          <>
            <Heading style={h2}>Observações</Heading>
            <Text style={text}>{notes}</Text>
          </>
        )}

        <Heading style={h2}>O que esperar</Heading>
        <Text style={text}>
          • Durante os 7 dias você será avaliado(a) diariamente em critérios como
          pontualidade, postura, atendimento, conhecimento técnico e trabalho em equipe.<br />
          • <strong>No 3º dia</strong>, o gestor solicitará seu <strong>exame admissional</strong>.<br />
          • <strong>No 7º dia</strong>, com o exame entregue, sua contratação será efetivada.<br />
          • Compareça <strong>10 minutos antes</strong> do horário, com uniforme/roupa adequada e
          documento com foto.
        </Text>

        <Text style={text}>
          Em caso de dúvida ou imprevisto, fale diretamente com o(a) responsável
          pelo treinamento ou responda este e-mail.
        </Text>

        <Text style={footer}>
          Boa sorte e seja bem-vindo(a)!<br />
          Equipe {SITE_NAME}
        </Text>
      </Container>
    </Body>
  </Html>
)

export const template = {
  component: TrainingScheduled,
  subject: (data: Record<string, any>) =>
    `Seu treinamento está agendado${data?.startDate ? ` — início em ${data.startDate}` : ''} — ${SITE_NAME}`,
  displayName: 'Treinamento agendado',
  previewData: {
    name: 'Mauro',
    jobTitle: 'Auxiliar de produção',
    startDate: 'Segunda-feira, 28 de abril de 2026',
    locationName: 'Loja Asa Sul — cozinha',
    responsibleName: 'Lilian Lima',
    notes: 'Trazer touca e sapato fechado.',
    days: [
      { day_date: 'Seg, 28/04', start_time: '08:00', end_time: '17:00', break_start: '12:00', break_end: '13:00' },
      { day_date: 'Ter, 29/04', start_time: '08:00', end_time: '17:00', break_start: '12:00', break_end: '13:00' },
      { day_date: 'Qua, 30/04', is_day_off: true },
      { day_date: 'Qui, 01/05', start_time: '08:00', end_time: '17:00', break_start: '12:00', break_end: '13:00' },
      { day_date: 'Sex, 02/05', start_time: '08:00', end_time: '17:00', break_start: '12:00', break_end: '13:00' },
    ],
  },
} satisfies TemplateEntry

const main = { backgroundColor: '#ffffff', fontFamily: 'Arial, sans-serif' }
const container = { padding: '20px 25px', maxWidth: '600px' }
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
const hr = { borderColor: '#e2e8f0', margin: '12px 0' }
const scheduleBox = {
  border: '1px solid #e2e8f0',
  borderRadius: '8px',
  padding: '8px 16px',
  margin: '8px 0 24px',
}
const dayRow = { padding: '10px 0', borderBottom: '1px solid #f1f5f9' }
const dayDate = { fontSize: '13px', color: '#0f172a', fontWeight: 'bold', margin: '0 0 4px' }
const dayHours = { fontSize: '13px', color: '#475569', margin: '0' }
const dayOff = { fontSize: '13px', color: '#f59e0b', fontWeight: 'bold', margin: '0' }
const dayNotes = { fontSize: '12px', color: '#94a3b8', margin: '4px 0 0', fontStyle: 'italic' as const }
const footer = { fontSize: '12px', color: '#94a3b8', margin: '30px 0 0', lineHeight: '1.6' }
