# Security Analysis Report - Git Branch Pruner

**Date:** 2026-09-24  
**Analyst:** Mistral Vibe CLI Agent  
**Project:** git-branch-pruner (v0.1.1)  
**Repository:** https://github.com/monkeykjy/git-branch-pruner

---

## 🚨 Executive Summary

**Result: NO MALICIOUS CODE DETECTED**

The project contains **no intentional backdoors, malware, or hidden payloads**. However, it has **CRITICAL security vulnerabilities** that **MUST be fixed before deployment**.

**Overall Security Score: 2/10** ⚠️ (Critical - Do not deploy until fixed)

---

## 🔴 Critical Vulnerabilities (Must Fix Before Deployment)

### 1. Command Injection Vulnerabilities (Severity: CRITICAL - CVSS 9.8+)

**File:** `src/services/GitService.ts`

#### Issue 1 - Line 68
```typescript
await this.execGit(`git branch -D "${branch}"`, workingDir);
```

**Risk:** If an attacker provides a malicious branch name such as:
- `main; rm -rf /` → Would execute `git branch -D "main; rm -rf /"` **AND** the `rm -rf /` command
- `test&&cat /etc/passwd` → Would execute both commands
- `branch$(malicious_command)` → Command substitution

#### Issue 2 - Line 196
```typescript
await this.execGit(`git rev-parse --verify ${branchName}`, workingDir);
```

**Risk:** Even worse - no quotes around `${branchName}`, so `branchName = "main; id"` would execute `git rev-parse --verify main; id`

**Impact:** Arbitrary code execution on the user's system with the permissions of the running process.

---

## 🟡 Medium Severity Vulnerabilities

### 2. Shell Usage with `child_process.exec` (Severity: MEDIUM)

- `exec` goes through a shell by default, which allows interpretation of special characters
- **Recommendation:** Use `execFile` or `spawn` with separate arguments

**Location:** `src/services/GitService.ts`, lines 122-135

### 3. No Input Validation (Severity: MEDIUM)

- No validation that branch names are safe before passing them to shell commands
- **Recommendation:** Validate with pattern: `/^[a-zA-Z0-9._-]+$/`

**Location:** `src/services/GitService.ts`, lines 68, 196

### 4. Pre/Post Scripts Enabled (Severity: LOW)

- `.npmrc` contains `enable-pre-post-scripts = true`
- **Risk:** If a dependency is compromised, it could execute code during installation

**Location:** `.npmrc`, line 1

---

## 🟢 Safe Elements

### ✅ Dependencies

All dependencies are **clean and well-maintained**:

| Dependency | Version | Status | Known CVEs |
|------------|---------|--------|-------------|
| esbuild | 0.20.2 | ✅ Secure | None |
| typescript | 5.8.3 | ✅ Secure | None |
| sharp | 0.34.1 | ✅ Secure | None critical |
| @types/node | 20.17.30 | ✅ Secure | Types only |
| @types/mocha | 10.0.10 | ✅ Secure | Types only |
| @types/vscode | 1.99.1 | ✅ Secure | Types only |
| @vscode/test-cli | 0.0.4 | ✅ Secure | None |
| mocha | 10.8.2 | ✅ Secure | None |
| ts-node | 10.9.2 | ✅ Secure | None |

### ✅ No Suspicious Code Found

- ❌ **No** `eval()`
- ❌ **No** `new Function()`
- ❌ **No** `__proto__` manipulation
- ❌ **No** obfuscated code
- ❌ **No** `WebSocket`, `fetch`, or suspicious network calls
- ❌ **No** `fs.writeFile`, `fs.unlink` or malicious file operations
- ❌ **No** data exfiltration
- ❌ **No** remote code downloads
- ❌ **No** malicious installation hooks (`preinstall`, `postinstall`)

### ✅ Scripts

All scripts in `package.json` are legitimate:
- `compile` - TypeScript compilation
- `watch` - Development mode
- `test` - Test execution
- `package` - Extension packaging
- `publish` - Publishing

---

## 📊 Security Score Breakdown

| Category | Score | Reason |
|----------|-------|--------|
| Malicious Code | ✅ 10/10 | No malicious code detected |
| Vulnerabilities | ❌ 0/10 | Critical command injection vulnerabilities |
| Dependencies | ✅ 9/10 | Clean, recent versions |
| Security Practices | ⚠️ 5/10 | Missing input validation |
| **Overall** | **⚠️ 2/10** | **Must be fixed before deployment** |

---

## 🛡️ Recommended Fixes (URGENT)

### Fix 1: Use execFile with Separate Arguments (RECOMMENDED)

```typescript
import { execFile } from 'child_process';
const execFileAsync = promisify(execFile);

// Replace all execGit usages with:
private async execGit(args: string[], cwd?: string): Promise<{ stdout: string; stderr: string }> {
  const options = this.getExecOptions(cwd);
  const result = await execFileAsync('git', args, options);
  return result;
}

// Then call:
await this.execGit(['branch', '-D', branch], workingDir);
await this.execGit(['rev-parse', '--verify', branchName], workingDir);
```

### Fix 2: Validate Branch Names

```typescript
function isSafeBranchName(name: string): boolean {
  // Valid Git branch names
  return /^[a-zA-Z0-9._-]+$/.test(name) &&
         !name.startsWith('-') &&
         name.length <= 250;
}

// Use in deleteBranches:
for (const branch of branchNames) {
  if (!isSafeBranchName(branch)) {
    throw new Error(`Invalid branch name: ${branch}`);
  }
  // ...
}
```

### Fix 3: Minimum - Escape Arguments

If you cannot switch to execFile immediately, at minimum escape the arguments:

```typescript
private escapeShellArg(arg: string): string {
  return `'${arg.replace(/'/g, "'\\''")}'`;
}

// Then use:
await this.execGit(`git branch -D ${this.escapeShellArg(branch)}`, workingDir);
```

**⚠️ IMPORTANT:** Fix 1 (`execFile`) is **strongly recommended** as it completely eliminates shell injection risk.

---

## 📋 Dependency Vulnerability Status

All direct dependencies have been checked against known vulnerability databases. No critical CVEs affect the current dependency versions.

---

## 🎯 Conclusion

✅ **No Malicious Code** - The project is clean from intentional backdoors or malware  
❌ **Critical Vulnerabilities Present** - Must be fixed before any production use or distribution  
⚠️ **Do NOT publish/share** until command injection vulnerabilities are resolved

**Absolute Priority:** Fix command injection vulnerabilities in `GitService.ts` before any production deployment.

---

## 📞 Contact

For questions about this security analysis, please refer to the analysis timestamp and review the findings in detail.

---

*This document was generated by an automated security analysis tool and should be reviewed by a security professional before making final deployment decisions.*
