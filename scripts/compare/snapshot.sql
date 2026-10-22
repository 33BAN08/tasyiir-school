-- Schema snapshot for the DEV <-> production comparison: one row per object,
-- (category, key, val). Catalog reads only. Used by prod-snapshot.mjs (production,
-- read-only transaction) and pasted into the Supabase MCP for DEV.
-- No trailing semicolon: callers wrap it in a CTE.
with
rels as (
  select c.oid, n.nspname, c.relname, c.relkind, c.relrowsecurity, c.relforcerowsecurity, c.relacl, c.relowner
  from pg_class c join pg_namespace n on n.oid = c.relnamespace
  where n.nspname in ('public', 'private') and c.relkind in ('r', 'p', 'v', 'm', 'S', 'f')
),
fns as (
  select p.oid, p.proacl, p.proowner,
         n.nspname || '.' || p.proname || '(' || pg_get_function_identity_arguments(p.oid) || ')' as sig
  from pg_proc p join pg_namespace n on n.oid = p.pronamespace
  where n.nspname in ('public', 'private')
    and not exists (select 1 from pg_depend d where d.objid = p.oid and d.deptype = 'e')
),
watched_roles as (select unnest(array['anon', 'authenticated', 'service_role']) as rolname)
-- ::text: the union takes its column types from this first select, and `name` would cut every key at 63 bytes.
select 'extension'::text as category, e.extname::text as key, e.extversion || ' in ' || e.extnamespace::regnamespace::text as val
from pg_extension e
union all
select 'schema', n.nspname,
       'owner=' || pg_get_userbyid(n.nspowner) || ' acl=' ||
       coalesce(array_to_string(array(select x::text from unnest(n.nspacl) x order by 1), ','), 'default')
from pg_namespace n where n.nspname in ('public', 'private')
union all
select 'relation', r.nspname || '.' || r.relname,
       'kind=' || r.relkind::text || ' rls=' || r.relrowsecurity || ' force=' || r.relforcerowsecurity ||
       ' owner=' || pg_get_userbyid(r.relowner) ||
       case when r.relkind in ('v', 'm') then ' def=' || md5(pg_get_viewdef(r.oid)) else '' end
from rels r
union all
select 'column', r.nspname || '.' || r.relname || '.' || a.attname,
       format_type(a.atttypid, a.atttypmod) ||
       case when a.attnotnull then ' not null' else '' end ||
       coalesce(' default ' || pg_get_expr(d.adbin, d.adrelid), '') ||
       case when a.attidentity <> '' then ' identity ' || a.attidentity::text else '' end ||
       case when a.attgenerated <> '' then ' generated ' || coalesce(pg_get_expr(d.adbin, d.adrelid), '') else '' end
from rels r
join pg_attribute a on a.attrelid = r.oid and a.attnum > 0 and not a.attisdropped
left join pg_attrdef d on d.adrelid = a.attrelid and d.adnum = a.attnum
where r.relkind in ('r', 'p', 'v', 'm', 'f')
union all
select 'constraint', r.nspname || '.' || r.relname || '.' || co.conname, pg_get_constraintdef(co.oid)
from pg_constraint co join rels r on r.oid = co.conrelid
union all
select 'type', n.nspname || '.' || t.typname,
       'kind=' || t.typtype::text ||
       coalesce(' labels=' || (select string_agg(enumlabel, ',' order by enumsortorder) from pg_enum where enumtypid = t.oid), '') ||
       coalesce(' base=' || format_type(t.typbasetype, t.typtypmod), '')
from pg_type t join pg_namespace n on n.oid = t.typnamespace
where n.nspname in ('public', 'private') and t.typtype in ('e', 'd', 'c', 'r')
  and (t.typrelid = 0 or exists (select 1 from pg_class c where c.oid = t.typrelid and c.relkind = 'c'))
  and not exists (select 1 from pg_depend d where d.objid = t.oid and d.deptype = 'e')
union all
select 'index', n.nspname || '.' || ic.relname, pg_get_indexdef(i.indexrelid)
from pg_index i join pg_class ic on ic.oid = i.indexrelid join pg_namespace n on n.oid = ic.relnamespace
where n.nspname in ('public', 'private')
union all
select 'policy', p.schemaname || '.' || p.tablename || '.' || p.policyname,
       p.permissive || ' ' || p.cmd || ' to ' || array_to_string(array(select x from unnest(p.roles) x order by 1), ',') ||
       ' using ' || coalesce(p.qual, '-') || ' check ' || coalesce(p.with_check, '-')
from pg_policies p where p.schemaname in ('public', 'private', 'storage')
union all
select 'grant',
       r.nspname || '.' || r.relname || ' ' ||
       case when a.grantee = 0 then 'PUBLIC' else pg_get_userbyid(a.grantee) end || ' ' || a.privilege_type,
       'grantable=' || a.is_grantable
from rels r
cross join lateral aclexplode(coalesce(r.relacl, acldefault(case when r.relkind = 'S' then 's'::"char" else 'r'::"char" end, r.relowner))) a
where a.grantee = 0 or pg_get_userbyid(a.grantee) in (select rolname from watched_roles)
union all
select 'column_grant',
       r.nspname || '.' || r.relname || '.' || at.attname || ' ' ||
       case when a.grantee = 0 then 'PUBLIC' else pg_get_userbyid(a.grantee) end || ' ' || a.privilege_type,
       'grantable=' || a.is_grantable
from rels r
join pg_attribute at on at.attrelid = r.oid and at.attnum > 0 and not at.attisdropped and at.attacl is not null
cross join lateral aclexplode(at.attacl) a
where a.grantee = 0 or pg_get_userbyid(a.grantee) in (select rolname from watched_roles)
union all
select 'function', f.sig,
       'returns ' || pg_get_function_result(p.oid) || ' lang=' || l.lanname || ' secdef=' || p.prosecdef ||
       ' volatile=' || p.provolatile::text || ' config=' || coalesce(array_to_string(p.proconfig, ';'), '-') ||
       ' owner=' || pg_get_userbyid(p.proowner) || ' body=' || md5(p.prosrc)
from fns f join pg_proc p on p.oid = f.oid join pg_language l on l.oid = p.prolang
union all
select 'function_grant',
       f.sig || ' ' || case when a.grantee = 0 then 'PUBLIC' else pg_get_userbyid(a.grantee) end || ' ' || a.privilege_type,
       'grantable=' || a.is_grantable
from fns f
cross join lateral aclexplode(coalesce(f.proacl, acldefault('f'::"char", f.proowner))) a
where a.grantee = 0 or pg_get_userbyid(a.grantee) in (select rolname from watched_roles)
union all
select 'trigger', n.nspname || '.' || c.relname || '.' || t.tgname,
       pg_get_triggerdef(t.oid) || ' enabled=' || t.tgenabled::text
from pg_trigger t join pg_class c on c.oid = t.tgrelid join pg_namespace n on n.oid = c.relnamespace
where not t.tgisinternal
  and (n.nspname in ('public', 'private') or t.tgfoid in (select oid from fns))
union all
select 'default_acl',
       pg_get_userbyid(d.defaclrole) || ' ' || coalesce(d.defaclnamespace::regnamespace::text, '*') || ' ' || d.defaclobjtype::text,
       array_to_string(array(select x::text from unnest(d.defaclacl) x order by 1), ',')
from pg_default_acl d
union all
select 'bucket', b.id,
       'name=' || b.name || ' public=' || b.public || ' size=' || coalesce(b.file_size_limit::text, '-') ||
       ' mime=' || coalesce(array_to_string(array(select x from unnest(b.allowed_mime_types) x order by 1), ','), '-')
from storage.buckets b
union all
select 'publication', pt.pubname || ' ' || pt.schemaname || '.' || pt.tablename,
       'insert=' || p.pubinsert || ' update=' || p.pubupdate || ' delete=' || p.pubdelete
from pg_publication p join pg_publication_tables pt on pt.pubname = p.pubname
where p.pubname = 'supabase_realtime'
union all
select 'cron_job', j.jobname,
       j.schedule || ' | ' || j.command || ' | db=' || j.database || ' user=' || j.username || ' active=' || j.active
from cron.job j
union all
-- Names only: the CLI stores each migration split into statements, the MCP as one block.
select 'migration', m.version, m.name from supabase_migrations.schema_migrations m
union all
-- Reference data, by key (ids differ between projects).
select 'ref_module', m.key, 'sort=' || m.sort_order from public.modules m
union all
select 'ref_permission', p.key, 'module=' || coalesce(p.module_key, '-') from public.permissions p
union all
select 'ref_plan', p.key,
       'name=' || p.name || ' monthly=' || coalesce(p.price_monthly::text, '-') || ' yearly=' || coalesce(p.price_yearly::text, '-') ||
       ' max_students=' || coalesce(p.max_students::text, '-') || ' active=' || p.is_active
from public.plans p
union all
select 'ref_plan_module', p.key || '.' || pm.module_key, ''
from public.plan_modules pm join public.plans p on p.id = pm.plan_id
union all
select 'ref_role', r.key, 'name=' || r.name || ' system=' || r.is_system
from public.roles r where r.school_id is null
union all
select 'ref_role_permission', r.key || '.' || rp.permission_key, ''
from public.role_permissions rp join public.roles r on r.id = rp.role_id
where r.school_id is null
