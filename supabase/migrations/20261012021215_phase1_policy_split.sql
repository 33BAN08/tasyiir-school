-- Phase 1 follow-up: split platform-owner "for all" write policies into
-- insert/update/delete so SELECT is evaluated by one policy only
-- (advisor: multiple_permissive_policies). Access rules are unchanged.
-- Runs in one transaction: no table is ever left without its write policies.

create index permissions_module_key_idx on public.permissions (module_key);

-- modules
drop policy modules_write on public.modules;
create policy modules_insert on public.modules for insert to authenticated
  with check ((select private.is_platform_owner()));
create policy modules_update on public.modules for update to authenticated
  using ((select private.is_platform_owner())) with check ((select private.is_platform_owner()));
create policy modules_delete on public.modules for delete to authenticated
  using ((select private.is_platform_owner()));

-- plans
drop policy plans_write on public.plans;
create policy plans_insert on public.plans for insert to authenticated
  with check ((select private.is_platform_owner()));
create policy plans_update on public.plans for update to authenticated
  using ((select private.is_platform_owner())) with check ((select private.is_platform_owner()));
create policy plans_delete on public.plans for delete to authenticated
  using ((select private.is_platform_owner()));

-- plan_modules
drop policy plan_modules_write on public.plan_modules;
create policy plan_modules_insert on public.plan_modules for insert to authenticated
  with check ((select private.is_platform_owner()));
create policy plan_modules_update on public.plan_modules for update to authenticated
  using ((select private.is_platform_owner())) with check ((select private.is_platform_owner()));
create policy plan_modules_delete on public.plan_modules for delete to authenticated
  using ((select private.is_platform_owner()));

-- school_subscriptions
drop policy school_subscriptions_write on public.school_subscriptions;
create policy school_subscriptions_insert on public.school_subscriptions for insert to authenticated
  with check ((select private.is_platform_owner()));
create policy school_subscriptions_update on public.school_subscriptions for update to authenticated
  using ((select private.is_platform_owner())) with check ((select private.is_platform_owner()));
create policy school_subscriptions_delete on public.school_subscriptions for delete to authenticated
  using ((select private.is_platform_owner()));

-- school_modules
drop policy school_modules_write on public.school_modules;
create policy school_modules_insert on public.school_modules for insert to authenticated
  with check ((select private.is_platform_owner()));
create policy school_modules_update on public.school_modules for update to authenticated
  using ((select private.is_platform_owner())) with check ((select private.is_platform_owner()));
create policy school_modules_delete on public.school_modules for delete to authenticated
  using ((select private.is_platform_owner()));
