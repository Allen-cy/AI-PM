begin;

-- Compatibility marker for the pre-release V6.6.3 migration timestamp that
-- was registered in production before its dependency order was reviewed.
-- The effective guard is applied after V6.6.0 by migration 20260716123000.
select 1;

commit;
