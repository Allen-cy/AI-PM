-- AI-PMO V6.3.4 additive security-posture repair.
-- The common audit requires service_role CRUD and explicit function execute.
-- Event mutation remains impossible because the append-only trigger rejects
-- every UPDATE or DELETE at the database boundary.

grant select,insert,update,delete on table public.formal_business_output_events to service_role;
grant execute on function public.prevent_v634_output_event_mutation() to service_role;
grant execute on function public.materialize_v634_meeting_minutes_output() to service_role;
grant execute on function public.materialize_v634_knowledge_output() to service_role;
