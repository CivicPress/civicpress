# 📦 CivicPress Spec: `module-api.md`

## 📛 Name

`module-api` — CivicPress Module API Interface

## 🎯 Purpose

Define what each CivicPress module must export or register to integrate cleanly
with the platform.

---

## 🧩 Scope & Responsibilities

✅ Responsibilities:

- Define metadata format (name, version, author)
- Define lifecycle hooks (onLoad, onRecordSubmit)
- Declare UI needs (routes, permissions, editor panels)
- Register hooks or workflows

❌ Out of scope:

- Implementation details inside the module
- Specific civic record formats (those vary by module)

---

## 🔗 Inputs & Outputs

Input: Module folder with package.json  
Output: Registered features, loaded hooks, optional UI routes

---

## 📂 File/Folder Location

```
modules/<name>/
modules/<name>/package.json
modules/<name>/index.ts
```

---

## 🔐 Security & Trust Considerations

- Only modules that follow this interface will be loaded
- Optionally: signed modules or hash checks (future)

---

## 🧪 Testing & Validation

- Validate presence of required exports
- Ensure no global scope leaks
- Run `pnpm run validate` for conformance

---

## 🛠️ Future Enhancements

- Dynamic module loading
- Remote registry of civic modules
- Graph view of dependencies

---

## 📅 History

- Drafted: 2025-07-03
- Last updated: 2025-07-03
