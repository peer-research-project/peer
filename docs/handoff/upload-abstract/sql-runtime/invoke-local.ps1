param([ValidateSet('check','bundle','tests')][string]$Action='check', [string]$SequenceMetadata = '')
$ErrorActionPreference = 'Stop'
$taskRoot = Join-Path $env:TEMP 'peer-seed-pg-runtime'
$bin = Join-Path $taskRoot 'pgsql\bin'
$psql = Join-Path $bin 'psql.exe'
$taskDb = 'peer_prodmeta_secure'
$expectedData = (Join-Path $taskRoot 'data').Replace('\','/')
$psqlArgs = @('-X','-qAt','-h','127.0.0.1','-p','55479','-U','peer_test_admin','-d',$taskDb,'-v','ON_ERROR_STOP=1')
function Invoke-LocalSql([string]$sql) {
  $out = & $psql @psqlArgs -c $sql
  if ($LASTEXITCODE -ne 0) { throw 'Local SQL check failed' }
  return ($out -join "`n").Trim()
}
if (-not (Test-Path -LiteralPath $psql)) { throw 'Task-local PostgreSQL binary missing' }
$identity = Invoke-LocalSql "SELECT host(inet_server_addr()) || '|' || inet_server_port()::text || '|' || current_database() || '|' || current_setting('data_directory')"
if ($identity -ine "127.0.0.1|55479|$taskDb|$expectedData") { throw 'Refusing non-task PostgreSQL target' }
Write-Output 'Verified loopback task cluster, data directory and database.'
if ($Action -eq 'bundle') {
  if (-not $SequenceMetadata -or -not (Test-Path -LiteralPath $SequenceMetadata)) { throw 'Read-only production sequence metadata is required before bundle replay' }
  $prod = Get-Content -Raw -LiteralPath $SequenceMetadata | ConvertFrom-Json
  $localJson = & $psql @psqlArgs -f (Join-Path $PSScriptRoot 'sequence-metadata-local.sql')
  if ($LASTEXITCODE -ne 0) { throw 'Local sequence metadata query failed' }
  $local = ($localJson -join "`n") | ConvertFrom-Json
  foreach ($name in @('postgres_auth_usage','postgres_auth_users_references','postgres_public_create','sequence_name','owner','acl','type','start','increment','minimum','maximum','cache','cycle','service_usage','service_select','authenticated_usage','anon_usage')) {
    if ($null -eq $prod.PSObject.Properties[$name] -or $null -eq $local.PSObject.Properties[$name]) { throw "Missing sequence/security metadata: $name" }
    if ($prod.$name -cne $local.$name) { throw "Sequence/security metadata mismatch: $name" }
  }
  if ($null -eq $prod.postgres_role -or $null -eq $local.postgres_role) { throw "Missing postgres role metadata" }
  foreach ($name in @('rolsuper','rolinherit','rolcreaterole','rolcreatedb','rolcanlogin','rolbypassrls')) {
    if ($null -eq $prod.postgres_role.PSObject.Properties[$name] -or $null -eq $local.postgres_role.PSObject.Properties[$name]) { throw "Missing postgres role metadata: $name" }
    if ($prod.postgres_role.$name -cne $local.postgres_role.$name) { throw "Postgres role metadata mismatch: $name" }
  }
  if ((Invoke-LocalSql "SELECT coalesce(to_regclass('public.seed_pool_state')::text,'absent')") -ne 'absent') { throw 'Refusing replay on a database that already has seed state' }
  $bundle = Join-Path $PSScriptRoot 'seed-closure-canonical-lf.sql'
  if ((Get-FileHash -Algorithm SHA256 -LiteralPath $bundle).Hash -ne 'F1D16D710C9B451CE90F5F3254B80DFE9D0A566779EC2485C51207BAEAC5745A') { throw 'Bundle hash mismatch' }
  & $psql @psqlArgs -f $bundle
  if ($LASTEXITCODE -ne 0) { throw 'Local bundle replay failed' }
  Write-Output 'Exact local bundle replay passed.'
}
if ($Action -eq 'tests') {
  foreach ($name in @('prodmeta-legacy-check.sql','lifecycle-prodmeta.sql','dates-permissions-prodmeta.sql','legacy-retention-prodmeta.sql','prodmeta-owner-cleanup.sql','prodmeta-legacy-digest-fixed.sql')) {
    & $psql @psqlArgs -f (Join-Path $PSScriptRoot $name)
    if ($LASTEXITCODE -ne 0) { throw "Local test failed: $name" }
  }
  python (Join-Path $PSScriptRoot 'concurrency-secure.py')
  if ($LASTEXITCODE -ne 0) { throw 'Local concurrency tests failed' }
  Write-Output 'Local test matrix passed.'
}
