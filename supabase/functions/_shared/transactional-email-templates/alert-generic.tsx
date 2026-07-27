/// <reference types="npm:@types/react@18.3.1" />
import * as React from 'npm:react@18.3.1'
import {
  Body, Container, Head, Heading, Html, Preview, Section, Text,
} from 'npm:@react-email/components@0.0.22'
import type { TemplateEntry } from './registry.ts'

const SITE_NAME = 'NEXA'

interface AlertGenericProps {
  title?: string
  message?: string
  category?: string
  severity?: 'info' | 'warning' | 'critical'
}

const palette = {
  info:     { bar: '#2563eb', chip: '#dbeafe', text: '#1e3a8a', label: 'Informativo' },
  warning:  { bar: '#f59e0b', chip: '#fef3c7', text: '#78350f', label: 'Atenção' },
  critical: { bar: '#dc2626', chip: '#fee2e2', text: '#7f1d1d', label: 'Crítico' },
} as const

const AlertGeneric = ({ title, message, category, severity }: AlertGenericProps) => {
  const p = palette[severity ?? 'warning'] ?? palette.warning
  return (
    <Html lang="pt-BR" dir="ltr">
      <Head />
      <Preview>{title ?? 'Alerta do sistema'}</Preview>
      <Body style={main}>
        <Container style={container}>
          <Section style={{ ...bar, backgroundColor: p.bar }} />
          <Section style={{ padding: '20px 24px' }}>
            <Text style={{ ...chip, backgroundColor: p.chip, color: p.text }}>
              {(category ?? 'ALERTA').toUpperCase()} · {p.label}
            </Text>
            <Heading style={h1}>{title ?? 'Alerta do sistema'}</Heading>
            <Text style={text}>
              {(message ?? '').split('\n').map((line, i) => (
                <React.Fragment key={i}>{line}<br /></React.Fragment>
              ))}
            </Text>
            <Text style={footer}>
              Este é um alerta automático enviado pelo {SITE_NAME}. Para ajustar
              quem recebe cada tipo de alerta, acesse Configurações → Alertas e
              notificações.
            </Text>
          </Section>
        </Container>
      </Body>
    </Html>
  )
}

export const template = {
  component: AlertGeneric,
  subject: (data: Record<string, any>) => `[${SITE_NAME}] ${data?.title ?? 'Alerta do sistema'}`,
  displayName: 'Alerta genérico do sistema',
  previewData: {
    title: 'Câmara fria com temperatura elevada',
    message: 'ASA SUL — FREEZER 1\nÚltima leitura: -2°C (limite -18°C)',
    category: 'Câmara fria',
    severity: 'critical',
  },
} satisfies TemplateEntry

const main = { backgroundColor: '#f8fafc', fontFamily: 'Arial, sans-serif' }
const container = { margin: '0 auto', maxWidth: '560px', backgroundColor: '#ffffff', borderRadius: '8px', overflow: 'hidden', border: '1px solid #e2e8f0' }
const bar = { height: '6px', margin: 0 }
const chip = { display: 'inline-block', padding: '4px 10px', borderRadius: '999px', fontSize: '11px', fontWeight: 'bold', margin: '0 0 12px', letterSpacing: '0.04em' }
const h1 = { fontSize: '20px', fontWeight: 'bold', color: '#0f172a', margin: '0 0 16px', lineHeight: '1.3' }
const text = { fontSize: '14px', color: '#334155', lineHeight: '1.6', margin: '0 0 24px', whiteSpace: 'pre-wrap' as const }
const footer = { fontSize: '11px', color: '#94a3b8', margin: '24px 0 0', borderTop: '1px solid #e2e8f0', paddingTop: '16px' }
