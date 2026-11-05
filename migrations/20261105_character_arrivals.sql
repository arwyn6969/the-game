-- Additive cast support. Existing registrations and receiving profiles retain
-- their IDs, addresses and ownership; no registration is extended by this DDL.
alter table agent_registered_residents
  drop constraint agent_registered_residents_role_check;
alter table agent_registered_residents
  add constraint agent_registered_residents_role_check
  check (role in ('kevin','arwyn','northern','baba','sub','data','amelia','player','socrates','estee'));
