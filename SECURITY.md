# Security

Voltra is a local filesystem tool intended for a single user on their own Mac. Keep it bound to loopback. Do not publish it behind a proxy, tunnel, or shared server.

## Reporting a vulnerability

Do not post exploit details, private paths, or credentials in public issues. Use GitHub's **Security → Report a vulnerability** for a private report.

Include the affected commit, macOS and Node.js versions, expected versus actual behavior, and a reproduction using generated files. Path-validation bypasses, cross-origin access, file-identity races, and unintended deletion are security-relevant.

There is no guaranteed response-time commitment. This is an early release; review cleanup selections and maintain your own backups.
