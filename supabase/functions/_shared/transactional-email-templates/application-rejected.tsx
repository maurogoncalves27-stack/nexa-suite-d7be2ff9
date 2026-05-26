/// <reference types="npm:@types/react@18.3.1" />
import * as React from 'npm:react@18.3.1'
import {
  Body, Container, Head, Heading, Html, Preview, Text,
} from 'npm:@react-email/components@0.0.22'
import type { TemplateEntry } from './registry.ts'

const SITE_NAME = 'NEXA'

interface Props {
  name?: string
  jobTitle?: string
}

const ApplicationRejected = ({ name, jobTitle }: Props) => (
  <Html lang="pt-BR" dir="ltr">
    <Head />
    <Preview>Atualização sobre sua candidatura no {SITE_NAME}</Preview>
    <Body style={main}>
      <Container style={container}>
        <Heading style={h1}>
          {name ? `Olá, ${name}!` : 'Olá!'}
        </Heading>
        <Text style={text}>
          Antes de tudo, queremos agradecer muito pelo seu interesse em fazer parte
          do nosso time{jobTitle ? ` na vaga de ${jobTitle}` : ''}. Sabemos o quanto se
          candidatar a uma oportunidade exige tempo e dedicação, e isso não passou
          despercebido.
        </Text>
        <Text style={text}>
          Após uma análise cuidadosa do seu perfil, infelizmente não conseguiremos
          seguir com a sua candidatura neste processo. Isso não diminui em nada o
          seu valor profissional — simplesmente, neste momento, optamos por outro
          perfil mais alinhado às necessidades específicas da vaga.
        </Text>
        <Text style={text}>
          Gostaríamos de manter o seu currículo em nossa base de talentos. Quem sabe
          em uma próxima oportunidade não estaremos juntos? 🙂
        </Text>
        <Text style={text}>
          Desejamos muito sucesso na sua jornada e agradecemos por ter pensado na gente.
        </Text>
        <Text style={footer}>Com carinho,<br />Equipe {SITE_NAME}</Text>
      </Container>
    </Body>
  </Html>
)

export const template = {
  component: ApplicationRejected,
  subject: (data: Record<string, any>) =>
    `Sua candidatura${data?.jobTitle ? ` para ${data.jobTitle}` : ''} — ${SITE_NAME}`,
  displayName: 'Candidatura — não selecionado',
  previewData: { name: 'Maria', jobTitle: 'Atendente' },
} satisfies TemplateEntry

const main = { backgroundColor: '#ffffff', fontFamily: 'Arial, sans-serif' }
const container = { padding: '20px 25px', maxWidth: '560px' }
const h1 = { fontSize: '22px', fontWeight: 'bold', color: '#0f172a', margin: '0 0 20px' }
const text = { fontSize: '14px', color: '#475569', lineHeight: '1.6', margin: '0 0 18px' }
const footer = { fontSize: '12px', color: '#94a3b8', margin: '30px 0 0', lineHeight: '1.6' }
