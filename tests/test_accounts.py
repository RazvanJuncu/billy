"""Billy account boundaries: no client-side auth privilege or fake membership."""
import asyncio
import os
import unittest
from unittest.mock import patch

from fastapi import HTTPException
from starlette.requests import Request
from billy.accounts import Principal, require_member, supabase_config


def request(headers=None):
    pairs=[(k.lower().encode(),v.encode()) for k,v in (headers or {}).items()]
    return Request({"type":"http","method":"GET","headers":pairs,"path":"/api/vision/health","query_string":b""})


class AccountsTests(unittest.TestCase):
    def test_missing_project_does_not_enable_api(self):
        with patch.dict(os.environ,{"SUPABASE_URL":"","SUPABASE_PUBLISHABLE_KEY":""}):
            with self.assertRaises(HTTPException) as context:
                supabase_config()
        self.assertEqual(context.exception.status_code,503)

    def test_public_origin_requires_explicit_auth(self):
        with patch.dict(os.environ,{"SUPABASE_URL":"https://example.supabase.co","SUPABASE_PUBLISHABLE_KEY":"test-public"}):
            with self.assertRaises(HTTPException) as context:
                asyncio.run(require_member(request({"Origin":"https://razvanjuncu.github.io"})))
        self.assertEqual(context.exception.status_code,401)

    def test_malformed_org_not_accepted(self):
        with patch.dict(os.environ,{"SUPABASE_URL":"https://example.supabase.co","SUPABASE_PUBLISHABLE_KEY":"test-public"}):
            with self.assertRaises(HTTPException) as context:
                asyncio.run(require_member(request({"Authorization":"Bearer fake","X-Billy-Organization":"not-a-uuid"})))
        self.assertEqual(context.exception.status_code,400)

    def test_untrusted_origin_blocked(self):
        with self.assertRaises(HTTPException) as context:
            asyncio.run(require_member(request({"Origin":"https://third-party.example"})))
        self.assertEqual(context.exception.status_code,403)

    def test_no_user_selected_from_forged_claims(self):
        # Membership verification is performed via Supabase Auth / REST using the
        # bearer token, never a user ID accepted from the browser.
        import inspect
        source=inspect.getsource(require_member)
        self.assertIn("/auth/v1/user",source)
        self.assertIn("/rest/v1/organization_memberships",source)
        self.assertIn("Bearer ",source)


class SchemaTests(unittest.TestCase):
    def test_schema_contains_rls_for_every_data_table(self):
        from pathlib import Path
        path=Path(__file__).parents[1]/"supabase"/"migrations"/"202611061900_billy_accounts.sql"
        sql=path.read_text(encoding="utf-8")
        for table in ("account_profiles","organizations","organization_memberships",
                      "organization_join_requests","document_records"):
            self.assertIn(f"alter table public.{table} enable row level security;",sql)
        self.assertIn("with check (created_by=(select auth.uid()))",sql)
        self.assertIn("role in ('operator','reviewer')",sql)
        self.assertIn("grant select on public.document_records to authenticated;",sql)
        self.assertNotIn("grant all on public.document_records",sql.lower())
