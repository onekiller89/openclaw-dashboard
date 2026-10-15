"""Exercise the staged dashboard using only temporary synthetic state."""
from pathlib import Path
import argparse
import http.client
import json
import os
import secrets
import shutil
import socket
import subprocess
import tempfile
import time


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("repository", type=Path)
    args = parser.parse_args()
    checks = []
    with tempfile.TemporaryDirectory(prefix="dashboard-disabled-controls-") as directory:
        root = Path(directory)
        (root / "data").mkdir()
        (root / "openclaw").mkdir()
        for name in ("server.js", "index.html"):
            shutil.copy2(args.repository / name, root / name)
        config = root / "config.json"
        initial = b'{"synthetic":true}'
        config.write_bytes(initial)
        calls = root / "child-calls.log"
        preload = root / "block-child-process.cjs"
        preload.write_text("""const cp = require('child_process');
const fs = require('fs');
for (const name of ['exec', 'execSync', 'spawn', 'spawnSync', 'execFile', 'execFileSync']) {
  cp[name] = () => {
    fs.appendFileSync(process.env.TEST_CHILD_CALLS, name + '\\n');
    throw new Error('Child execution prohibited in this synthetic test');
  };
}
""")
        with socket.socket() as sock:
            sock.bind(("127.0.0.1", 0))
            port = sock.getsockname()[1]
        recovery = secrets.token_hex(24)
        env = dict(os.environ, HOME=directory, WORKSPACE_DIR=directory,
                   OPENCLAW_DIR=str(root / "openclaw"), OPENCLAW_CONFIG=str(config),
                   DASHBOARD_AUTH_DIR=str(root / "data"), DASHBOARD_HOST="127.0.0.1",
                   DASHBOARD_PORT=str(port), DASHBOARD_TOKEN=recovery,
                   NODE_OPTIONS="--require=" + str(preload), TEST_CHILD_CALLS=str(calls))
        process = subprocess.Popen(["node", str(root / "server.js")], cwd=directory,
                                   env=env, stdout=subprocess.PIPE,
                                   stderr=subprocess.PIPE, text=True)

        def request(path, method="GET", body=None, token=None):
            conn = http.client.HTTPConnection("127.0.0.1", port, timeout=5)
            headers = {"Content-Type": "application/json"}
            if token:
                headers["Authorization"] = "Bearer " + token
            conn.request(method, path, json.dumps(body) if body is not None else None, headers)
            response = conn.getresponse()
            status, data = response.status, response.read()
            conn.close()
            return status, data

        try:
            for attempt in range(40):
                try:
                    status, _ = request("/api/auth/status")
                    break
                except OSError:
                    time.sleep(0.1)
            else:
                raise AssertionError("synthetic server did not start")
            assert status == 200
            for path in ("/api/openclaw-config", "/api/docker/action"):
                assert request(path, "PUT", {"config": "{}"})[0] == 401
            checks.append("unauthenticated controls remain 401")
            password = "Synthetic!" + secrets.token_hex(16)
            status, data = request("/api/auth/register", "POST",
                                   {"username": "test-only", "password": password})
            assert status == 200
            response = json.loads(data)
            token = response.get("token") or response.get("sessionToken")
            assert token
            assert request("/")[0] == 200
            assert request("/api/health")[0] == 200
            assert request("/api/config", "OPTIONS")[0] == 204
            for path in ("/api/config", "/api/sessions", "/api/crons", "/api/notifications"):
                assert request(path, token=token)[0] == 200
            checks.append("legacy landing/health/authenticated reads and notifications work")
            baseline_calls = calls.read_bytes() if calls.exists() else b""
            count = 0
            for path in ("/api/openclaw-config", "/api/openclaw-config?review=1"):
                for method in ("GET", "PUT", "POST", "DELETE", "PATCH"):
                    status, data = request(path, method, {"config": '{"changed":true}'}, token)
                    assert status == 403 and json.loads(data)["code"] == "CONTROL_UNAVAILABLE"
                    count += 1
            for action in ("start", "stop", "restart", "prune-containers", "prune-images"):
                for path in ("/api/docker/action", "/api/docker/action?review=1"):
                    status, data = request(path, "POST", {"action": action, "id": "synthetic"}, token)
                    assert status == 403 and json.loads(data)["code"] == "CONTROL_UNAVAILABLE"
                    count += 1
            checks.append(str(count) + " authenticated mutation/config method/query cases rejected (403)")
            variants = (
                "/api/openclaw-config/", "/api//openclaw-config", "/api/%6fpenclaw-config",
                "/api/openclaw-config;variant", "/api/openclaw-config/./",
                "/api/other/../openclaw-config", "/api/openclaw-config#fragment",
                "/API/OPENCLAW-CONFIG", "/api%2Fdocker%2Faction",
                "/api%252Fdocker%252Faction", "/api/docker/action/", "/api/docker/action;variant",
                "//api/openclaw-config", "http://localhost/api/openclaw-config",
                "/api/docker", "/api/docker/", "/api/sys-security", "/api/sys-security/",
            )
            for path in variants:
                for method in ("GET", "HEAD", "OPTIONS"):
                    status, _ = request(path, method, token=token)
                    assert status == 403, (path, method, status)
                assert request(path, "OPTIONS")[0] == 401
            checks.append("54 authenticated canonical-path/HEAD/OPTIONS cases rejected; 18 unauthenticated preflights remain 401")
            assert request("/api/reauth", "POST", {"password": password}, token)[0] == 200
            assert request("/api/openclaw-config", "PUT", {"config": "{}"}, token)[0] == 403
            assert request("/api/docker/action", "POST", {"action": "prune-images"}, token)[0] == 403
            checks.append("successful reauthentication cannot enable disabled controls")
            assert config.read_bytes() == initial
            assert not list(root.glob("config.json.bak.*"))
            assert (calls.read_bytes() if calls.exists() else b"") == baseline_calls
            checks.append("no config writes/backups or additional child commands from rejected controls")
        finally:
            process.terminate()
            stdout, stderr = process.communicate(timeout=10)
        assert recovery not in stdout + stderr
        assert f"127.0.0.1:{port}" in stdout
        checks.append("loopback and recovery-log hardening retained")
    print(json.dumps({"passed": checks, "production_touched": False}, indent=2))


if __name__ == "__main__":
    main()
