
update public.notification_settings
set extra_recipients = (select extra_recipients from public.notification_settings where alert_key='timeclock'),
    sms_sender_id   = (select sms_sender_id   from public.notification_settings where alert_key='timeclock')
where alert_key = 'whatsapp_health';
