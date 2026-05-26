/// <reference types="npm:@types/react@18.3.1" />
import * as React from 'npm:react@18.3.1'

export interface TemplateEntry {
  component: React.ComponentType<any>
  subject: string | ((data: Record<string, any>) => string)
  to?: string
  displayName?: string
  previewData?: Record<string, any>
}

import { template as testEmail } from './test-email.tsx'
import { template as applicationRejected } from './application-rejected.tsx'
import { template as interviewApproved } from './interview-approved.tsx'
import { template as documentsRequest } from './documents-request.tsx'
import { template as trainingScheduled } from './training-scheduled.tsx'

export const TEMPLATES: Record<string, TemplateEntry> = {
  'test-email': testEmail,
  'application-rejected': applicationRejected,
  'interview-approved': interviewApproved,
  'documents-request': documentsRequest,
  'training-scheduled': trainingScheduled,
}
