"""Synthetic tests for the portable read-only email monitor (no network, no real inbox)."""
import io, json, os, sys, tempfile, unittest, urllib.error
from unittest import mock
sys.path.insert(0, os.path.dirname(__file__))
import email_monitor as em


class FakeResp(io.BytesIO):
    def __enter__(self): return self
    def __exit__(self, *a): self.close()


def opener(payload, calls):
    def _open(req, timeout=None):
        calls.append(req)
        return FakeResp(json.dumps(payload).encode())
    return _open


class T(unittest.TestCase):
    def setUp(self):
        self.d = tempfile.mkdtemp()
        self.state = os.path.join(self.d, "s", "state.json")
        self.env = mock.patch.dict(os.environ, {"AGENTMAIL_INBOX_ID": "fixture@agentmail.invalid", "AGENTMAIL_API_KEY": "SYNTHETIC", "OPENCARD_EMAIL_STATE_PATH": self.state}, clear=False)
        self.env.start()
        os.environ.pop("AGENTMAIL_API_KEY_FILE", None)

    def tearDown(self): self.env.stop()

    def go(self, payload):
        calls, out, err = [], io.StringIO(), io.StringIO()
        code = em.run(opener(payload, calls), out, err)
        return code, out.getvalue(), err.getvalue(), calls

    def test_new_then_no_new_and_only_get(self):
        msgs = {"messages": [{"message_id": "m1", "subject": "Vercel build failed", "from": "Vercel <x@fixture.invalid>"}, {"message_id": "m2", "subject": "Welcome"}]}
        code, out, _, calls = self.go(msgs)
        self.assertEqual(code, 0)
        self.assertTrue(out.startswith("NEW_MESSAGE"))
        self.assertIn("收到 2 封新郵件", out)
        self.assertIn("Vercel 部署失敗", out)
        self.assertIn("新用戶註冊", out)
        self.assertEqual([c.get_method() for c in calls], ["GET"])
        self.assertIn("/inboxes/fixture@agentmail.invalid/messages?limit=5", calls[0].full_url)
        self.assertEqual(calls[0].get_header("Authorization"), "Bearer SYNTHETIC")
        self.assertEqual(json.load(open(self.state))["last_seen_ids"], ["m1", "m2"])
        code, out, _, _ = self.go(msgs)
        self.assertEqual(out.strip(), "NO_NEW")

    def test_state_replaced_with_current_top5(self):
        os.makedirs(os.path.dirname(self.state))
        json.dump({"last_seen_ids": ["old"], "other": 1}, open(self.state, "w"))
        self.go({"data": [{"id": "n1", "subject": "billing update"}]})
        s = json.load(open(self.state))
        self.assertEqual(s["last_seen_ids"], ["n1"])
        self.assertEqual(s["other"], 1)

    def test_corrupt_state_treated_as_empty(self):
        os.makedirs(os.path.dirname(self.state)); open(self.state, "w").write("{bad")
        code, out, _, _ = self.go({"messages": [{"message_id": "a"}]})
        self.assertTrue(out.startswith("NEW_MESSAGE"))

    def test_http_error_exit2_state_untouched_no_secret_in_stderr(self):
        def bad(req, timeout=None): raise urllib.error.HTTPError(req.full_url, 401, "Unauthorized", {}, None)
        err = io.StringIO()
        self.assertEqual(em.run(bad, io.StringIO(), err), 2)
        self.assertFalse(os.path.exists(self.state))
        self.assertNotIn("SYNTHETIC", err.getvalue())

    def test_missing_config_exit2(self):
        os.environ.pop("AGENTMAIL_API_KEY"); err = io.StringIO()
        self.assertEqual(em.run(opener({}, []), io.StringIO(), err), 2)
        self.assertIn("missing AGENTMAIL", err.getvalue())

    def test_malformed_state_shapes_treated_as_empty(self):
        os.makedirs(os.path.dirname(self.state))
        for bad in ("[]", '{"last_seen_ids": "x"}'):
            open(self.state, "w").write(bad)
            code, out, _, _ = self.go({"messages": [{"message_id": "a"}]})
            self.assertEqual(code, 0); self.assertTrue(out.startswith("NEW_MESSAGE"))

    def test_redirects_not_followed(self):
        h = em._NoRedirect()
        self.assertIsNone(h.redirect_request(None, None, 302, "Found", {}, "https://evil.invalid/"))
        self.assertIs(em.run.__defaults__[0].__self__, em._OPENER)

    def test_key_file(self):
        p = os.path.join(self.d, "k"); open(p, "w").write("FROMFILE\n")
        os.environ["AGENTMAIL_API_KEY_FILE"] = p
        _, _, _, calls = self.go({"messages": []})
        self.assertEqual(calls[0].get_header("Authorization"), "Bearer FROMFILE")

    def test_no_write_verbs_in_source(self):
        src = open(em.__file__).read()
        for verb in ('method="POST"', 'method="PATCH"', 'method="DELETE"', 'method="PUT"', "/send", "/reply"):
            self.assertNotIn(verb, src)


if __name__ == "__main__":
    unittest.main()
