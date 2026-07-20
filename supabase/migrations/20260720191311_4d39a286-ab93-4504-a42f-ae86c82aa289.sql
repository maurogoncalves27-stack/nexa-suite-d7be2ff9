
DELETE FROM public.climate_response_answers
WHERE response_id IN (SELECT id FROM public.climate_responses WHERE survey_id = 'e831aabd-2c82-40c5-958e-727ae6c408cd');
DELETE FROM public.climate_responses WHERE survey_id = 'e831aabd-2c82-40c5-958e-727ae6c408cd';
DELETE FROM public.climate_response_tokens WHERE survey_id = 'e831aabd-2c82-40c5-958e-727ae6c408cd';
DELETE FROM public.climate_surveys WHERE id = 'e831aabd-2c82-40c5-958e-727ae6c408cd';
