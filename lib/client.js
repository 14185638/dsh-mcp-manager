// mcp-manager (client face) — the "MCP管理" settings section.
//
// Registers a `settings.section` list entry and talks to the mcp-manager
// host plugin through same-origin HTTP routes:
//   GET    /api/mcp-manager/servers
//   POST   /api/mcp-manager/servers   { server: {...} }
//   PUT    /api/mcp-manager/servers/<serverName>   { server: {...patch} }
//   DELETE /api/mcp-manager/servers/<serverName>
//
// This bundle is authored in the client module wire format
// (window.__ModuleLoader__.load) — the same shape the shipped client
// packages ship prebuilt. Its load id must equal the composition row id.

window.__ModuleLoader__.load({
  id: "mcp-manager",
  factory: (require) => {
    var module = { exports: {} };
    var exports = module.exports;
    Object.defineProperty(exports, Symbol.toStringTag, { value: "Module" });
    const React = require("react");
    const { jsx, jsxs, Fragment } = require("react/jsx-runtime");

    // ---------- styles (design tokens, same vocabulary as shipped sections) ----------
    const css = [
      ".mcpm_section{max-width:720px;color:var(--dsw-alias-label-primary);flex-direction:column;gap:12px;display:flex}",
      ".mcpm_title{color:var(--dsw-alias-label-primary);margin:0;font-size:16px;font-weight:500;line-height:24px}",
      ".mcpm_intro{color:var(--dsw-alias-label-tertiary);margin:0;font-size:14px;line-height:22px}",
      ".mcpm_error{color:var(--dsw-alias-state-error-primary);margin:0;font-size:12px;line-height:18px}",
      ".mcpm_notice{color:var(--dsw-alias-state-success-primary);margin:0;font-size:12px;line-height:18px}",
      ".mcpm_rows{flex-direction:column;gap:8px;margin:12px 0 0;padding:0;list-style:none;display:flex}",
      ".mcpm_row{border:1px solid var(--dsw-alias-border-l2);border-radius:12px;flex-direction:column;gap:10px;padding:12px 14px;display:flex}",
      ".mcpm_rowHead{align-items:center;gap:10px;display:flex}",
      ".mcpm_identity{align-items:center;gap:6px;min-width:0;display:inline-flex}",
      ".mcpm_name{color:var(--dsw-alias-label-primary);font-size:14px;font-weight:500;line-height:22px}",
      ".mcpm_tag{border:1px solid var(--dsw-alias-border-l3);color:var(--dsw-alias-label-secondary);border-radius:4px;flex:none;padding:1px 6px;font-size:11px;line-height:16px}",
      ".mcpm_dot{box-sizing:border-box;border-radius:50%;flex:none;width:8px;height:8px;display:inline-block}",
      ".mcpm_dotOn{background:var(--dsw-alias-state-success-primary)}",
      ".mcpm_dotOff{background:var(--dsw-alias-label-dimmed)}",
      ".mcpm_meta{color:var(--dsw-alias-label-tertiary);font-size:12px;line-height:18px}",
      ".mcpm_rowActions{align-items:center;gap:4px;margin-left:auto;display:inline-flex}",
      ".mcpm_button{box-sizing:border-box;height:36px;font:inherit;cursor:pointer;border:none;border-radius:18px;justify-content:center;align-items:center;gap:4px;padding:0 14px;font-size:14px;line-height:22px;display:inline-flex}",
      ".mcpm_button:disabled{opacity:.4;cursor:default}",
      ".mcpm_primary{background:var(--dsw-alias-button-primary-fill);color:var(--dsw-alias-label-primary-foreground)}",
      ".mcpm_primary:hover:not(:disabled){background:var(--dsw-alias-button-primary-hover)}",
      ".mcpm_secondary{border:1px solid var(--dsw-alias-border-l2);color:var(--dsw-alias-label-primary);background:0 0}",
      ".mcpm_secondary:hover:not(:disabled){background:var(--dsw-alias-interactive-bg-hover)}",
      ".mcpm_danger{box-sizing:border-box;height:28px;color:var(--dsw-alias-state-error-primary);font:inherit;cursor:pointer;background:0 0;border:none;border-radius:14px;align-items:center;padding:0 10px;font-size:12px;line-height:18px;display:inline-flex}",
      ".mcpm_danger:hover:not(:disabled){background:var(--dsw-alias-interactive-bg-hover-danger)}",
      ".mcpm_small{box-sizing:border-box;height:28px;font:inherit;cursor:pointer;border:1px solid var(--dsw-alias-border-l2);color:var(--dsw-alias-label-secondary);background:0 0;border-radius:14px;align-items:center;padding:0 10px;font-size:12px;line-height:18px;display:inline-flex}",
      ".mcpm_small:hover:not(:disabled){background:var(--dsw-alias-interactive-bg-hover);color:var(--dsw-alias-label-primary)}",
      ".mcpm_small:disabled{opacity:.4;cursor:default}",
      ".mcpm_editor{background:var(--dsw-alias-bg-module-platform);border-radius:12px;flex-direction:column;gap:12px;padding:14px 16px;display:flex}",
      ".mcpm_editorTitle{color:var(--dsw-alias-label-primary);font-size:14px;font-weight:500;line-height:22px}",
      ".mcpm_field{flex-direction:column;gap:6px;display:flex}",
      ".mcpm_fieldLabel{color:var(--dsw-alias-label-secondary);align-items:center;gap:10px;font-size:12px;font-weight:500;line-height:18px;display:inline-flex}",
      ".mcpm_input{box-sizing:border-box;border:1px solid var(--dsw-alias-border-l2);width:100%;height:32px;font:inherit;background:var(--dsw-alias-bg-layer-1);color:var(--dsw-alias-label-primary);border-radius:8px;padding:0 10px;font-size:14px;line-height:22px}",
      "select.mcpm_input{cursor:pointer;max-width:240px}",
      ".mcpm_input:focus{border-color:var(--dsw-alias-brand-primary);outline:none}",
      ".mcpm_input::placeholder{color:var(--dsw-alias-label-dimmed)}",
      ".mcpm_input:disabled{opacity:.6;cursor:default}",
      ".mcpm_textarea{box-sizing:border-box;border:1px solid var(--dsw-alias-border-l2);width:100%;min-height:56px;font:inherit;background:var(--dsw-alias-bg-layer-1);color:var(--dsw-alias-label-primary);border-radius:8px;padding:8px 10px;font-size:13px;line-height:20px;resize:vertical;font-family:var(--ds-font-family-code)}",
      ".mcpm_textarea:focus{border-color:var(--dsw-alias-brand-primary);outline:none}",
      ".mcpm_editorActions{justify-content:flex-end;gap:8px;display:flex}",
      ".mcpm_empty{border:1px dashed var(--dsw-alias-border-l3);color:var(--dsw-alias-label-tertiary);text-align:center;border-radius:8px;padding:12px;font-size:13px;line-height:20px}",
      ".mcpm_hint{color:var(--dsw-alias-label-tertiary);margin:0;font-size:12px;line-height:18px}",
      ".mcpm_check{display:inline-flex;align-items:center;gap:6px;color:var(--dsw-alias-label-secondary);font-size:12px;line-height:18px;cursor:pointer}",
    ].join("");

    const CSS_ID = "mcp-manager/mcp.css";
    if (typeof document !== "undefined" && document.querySelector(`style[data-plugin-css="${CSS_ID}"]`) === null) {
      const tag = document.createElement("style");
      tag.dataset.plugin = "mcp-manager";
      tag.dataset.pluginCss = CSS_ID;
      tag.textContent = css;
      document.head.appendChild(tag);
    }

    const c = {
      section: "mcpm_section", title: "mcpm_title", intro: "mcpm_intro",
      error: "mcpm_error", notice: "mcpm_notice", rows: "mcpm_rows", row: "mcpm_row",
      rowHead: "mcpm_rowHead", identity: "mcpm_identity", name: "mcpm_name",
      tag: "mcpm_tag", dot: "mcpm_dot", dotOn: "mcpm_dotOn", dotOff: "mcpm_dotOff",
      meta: "mcpm_meta", rowActions: "mcpm_rowActions", button: "mcpm_button",
      primary: "mcpm_primary", secondary: "mcpm_secondary", danger: "mcpm_danger",
      small: "mcpm_small", editor: "mcpm_editor", editorTitle: "mcpm_editorTitle",
      field: "mcpm_field", fieldLabel: "mcpm_fieldLabel", input: "mcpm_input",
      textarea: "mcpm_textarea", editorActions: "mcpm_editorActions", empty: "mcpm_empty",
      hint: "mcpm_hint", check: "mcpm_check",
    };

    const EMPTY_DRAFT = { serverName: "", transport: "streamable-http", url: "", command: "", headers: "", toolCallTimeoutMs: "" };

    // ---------- section component ----------
    function McpSection(props) {
      const [servers, setServers] = React.useState(null);
      const [draft, setDraft] = React.useState(EMPTY_DRAFT);
      const [edit, setEdit] = React.useState(null); // { name, form } | null
      const [busy, setBusy] = React.useState(false);
      const [message, setMessage] = React.useState(null);

      const refresh = React.useCallback(async () => {
        try {
          const res = await fetch("/api/mcp-manager/servers");
          const data = await res.json();
          setServers(data.servers ?? []);
          if (data.error) setMessage({ kind: "error", text: data.error });
        } catch (error) {
          setMessage({ kind: "error", text: `无法获取 MCP 服务器列表: ${String(error?.message ?? error)}` });
        }
      }, []);

      React.useEffect(() => { refresh(); }, [refresh]);

      const setField = (key) => (event) => setDraft((d) => ({ ...d, [key]: event.target.value }));
      const setEditField = (key) => (event) => setEdit((e) => (e ? { ...e, form: { ...e.form, [key]: event.target.value } } : e));
      const setEditCheck = (key) => (event) => setEdit((e) => (e ? { ...e, form: { ...e.form, [key]: event.target.checked } } : e));

      const startEdit = (server) => {
        setMessage(null);
        setEdit({
          name: server.serverName,
          form: {
            transport: server.transport,
            url: server.url ?? "",
            command: server.command ?? "",
            headers: "",
            clearHeaders: false,
            toolCallTimeoutMs: server.toolCallTimeoutMs ? String(server.toolCallTimeoutMs) : "",
          },
        });
      };

      const submit = async () => {
        setMessage(null);
        const name = draft.serverName.trim();
        if (!name) { setMessage({ kind: "error", text: "请填写服务器名称 (serverName)" }); return; }
        const server = { serverName: name, transport: draft.transport };
        if (draft.transport === "streamable-http") {
          const url = draft.url.trim();
          if (!url) { setMessage({ kind: "error", text: "Streamable HTTP 服务器需要填写 URL" }); return; }
          server.url = url;
          const rawHeaders = draft.headers.trim();
          if (rawHeaders.length > 0) {
            try { server.headers = JSON.parse(rawHeaders); }
            catch { setMessage({ kind: "error", text: "headers 不是合法的 JSON 对象" }); return; }
          }
        } else {
          const command = draft.command.trim();
          if (!command) { setMessage({ kind: "error", text: "stdio 服务器需要填写启动命令" }); return; }
          server.command = command;
        }
        const timeout = draft.toolCallTimeoutMs.trim();
        if (timeout.length > 0) {
          const value = Number(timeout);
          if (!Number.isFinite(value) || value <= 0) { setMessage({ kind: "error", text: "toolCallTimeoutMs 必须是正整数" }); return; }
          server.toolCallTimeoutMs = value;
        }
        setBusy(true);
        try {
          const res = await fetch("/api/mcp-manager/servers", {
            method: "POST",
            headers: { "content-type": "application/json" },
            body: JSON.stringify({ server }),
          });
          const data = await res.json();
          if (!data.ok) { setMessage({ kind: "error", text: data.error ?? "添加失败" }); return; }
          setMessage({ kind: "ok", text: `服务器 "${name}" 已添加` });
          setDraft(EMPTY_DRAFT);
          setServers(data.servers);
        } catch (error) {
          setMessage({ kind: "error", text: `添加失败: ${String(error?.message ?? error)}` });
        } finally {
          setBusy(false);
        }
      };

      const saveEdit = async () => {
        setMessage(null);
        if (!edit) return;
        const name = edit.name;
        const f = edit.form;
        const patch = { serverName: name, transport: f.transport };
        if (f.transport === "streamable-http") {
          const url = f.url.trim();
          if (!url) { setMessage({ kind: "error", text: "Streamable HTTP 服务器需要填写 URL" }); return; }
          patch.url = url;
        } else {
          const command = f.command.trim();
          if (!command) { setMessage({ kind: "error", text: "stdio 服务器需要填写启动命令" }); return; }
          patch.command = command;
        }
        const rawHeaders = f.headers.trim();
        if (rawHeaders.length > 0) {
          try { patch.headers = JSON.parse(rawHeaders); }
          catch { setMessage({ kind: "error", text: "headers 不是合法的 JSON 对象" }); return; }
        } else if (f.clearHeaders) {
          patch.headers = {};
        }
        const timeout = f.toolCallTimeoutMs.trim();
        if (timeout.length > 0) {
          const value = Number(timeout);
          if (!Number.isFinite(value) || value <= 0) { setMessage({ kind: "error", text: "toolCallTimeoutMs 必须是正整数" }); return; }
          patch.toolCallTimeoutMs = value;
        }
        setBusy(true);
        try {
          const res = await fetch(`/api/mcp-manager/servers/${encodeURIComponent(name)}`, {
            method: "PUT",
            headers: { "content-type": "application/json" },
            body: JSON.stringify({ server: patch }),
          });
          const data = await res.json();
          if (!data.ok) { setMessage({ kind: "error", text: data.error ?? "保存失败" }); return; }
          setMessage({ kind: "ok", text: `服务器 "${name}" 已更新` });
          setEdit(null);
          setServers(data.servers);
        } catch (error) {
          setMessage({ kind: "error", text: `保存失败: ${String(error?.message ?? error)}` });
        } finally {
          setBusy(false);
        }
      };

      const remove = async (name) => {
        if (!window.confirm(`确定删除 MCP 服务器 "${name}" 吗?其注册的工具将立即移除。`)) return;
        setMessage(null);
        setBusy(true);
        try {
          const res = await fetch(`/api/mcp-manager/servers/${encodeURIComponent(name)}`, { method: "DELETE" });
          const data = await res.json();
          if (!data.ok) { setMessage({ kind: "error", text: data.error ?? "删除失败" }); return; }
          setMessage({ kind: "ok", text: `服务器 "${name}" 已删除` });
          setServers(data.servers);
        } catch (error) {
          setMessage({ kind: "error", text: `删除失败: ${String(error?.message ?? error)}` });
        } finally {
          setBusy(false);
        }
      };

      const renderServerRow = (server) => {
        if (edit !== null && edit.name === server.serverName) {
          const f = edit.form;
          return jsxs("li", { className: c.row, children: [
            jsx("div", { className: c.editorTitle, children: `编辑 ${server.serverName}` }),
            jsx("div", { className: c.field, children: [
              jsx("label", { className: c.fieldLabel, children: "服务器名称 (serverName, 不可修改)" }),
              jsx("input", { className: c.input, value: server.serverName, disabled: true }),
            ] }),
            jsx("div", { className: c.field, children: [
              jsx("label", { className: c.fieldLabel, children: "传输方式 (transport)" }),
              jsx("select", { className: c.input, value: f.transport, onChange: setEditField("transport"), disabled: busy, children: [
                jsx("option", { value: "streamable-http", children: "Streamable HTTP" }),
                jsx("option", { value: "stdio", children: "stdio" }),
              ] }),
            ] }),
            f.transport === "streamable-http"
              ? jsx("div", { className: c.field, children: [
                  jsx("label", { className: c.fieldLabel, children: "URL" }),
                  jsx("input", { className: c.input, value: f.url, onChange: setEditField("url"), placeholder: "例如: http://localhost:3000/mcp", disabled: busy }),
                ] })
              : jsx("div", { className: c.field, children: [
                  jsx("label", { className: c.fieldLabel, children: "启动命令 (command)" }),
                  jsx("input", { className: c.input, value: f.command, onChange: setEditField("command"), placeholder: "例如: npx -y @modelcontextprotocol/server-github", disabled: busy }),
                ] }),
            f.transport === "streamable-http"
              ? jsxs("div", { className: c.field, children: [
                  jsx("label", { className: c.fieldLabel, children: "请求头 (headers, JSON 对象)" }),
                  jsx("textarea", { className: c.textarea, value: f.headers, onChange: setEditField("headers"), placeholder: "留空表示保持不变;填写则整体替换", disabled: busy }),
                  jsx("label", { className: c.check, children: jsx("input", { type: "checkbox", checked: f.clearHeaders, onChange: setEditCheck("clearHeaders"), disabled: busy }) }),
                  jsx("span", { children: "清空所有请求头" }),
                  server.headerKeys && server.headerKeys.length > 0
                    ? jsx("p", { className: c.hint, children: `当前请求头键名: ${server.headerKeys.join(", ")}` })
                    : jsx("p", { className: c.hint, children: "当前没有请求头" }),
                ] })
              : null,
            jsx("div", { className: c.field, children: [
              jsx("label", { className: c.fieldLabel, children: "工具调用超时 (ms,可选)" }),
              jsx("input", { className: c.input, value: f.toolCallTimeoutMs, onChange: setEditField("toolCallTimeoutMs"), placeholder: "默认 60000", disabled: busy }),
            ] }),
            jsx("div", { className: c.editorActions, children: [
              jsx("button", { type: "button", className: `${c.button} ${c.secondary}`, disabled: busy, onClick: () => setEdit(null), children: "取消" }),
              jsx("button", { type: "button", className: `${c.button} ${c.primary}`, disabled: busy, onClick: saveEdit, children: "保存" }),
            ] }),
          ] }, server.serverName);
        }
        return jsxs("li", { className: c.row, children: [
          jsxs("div", { className: c.rowHead, children: [
            jsx("span", { className: `${c.dot} ${server.mounted ? c.dotOn : c.dotOff}` }),
            jsxs("span", { className: c.identity, children: [
              jsx("span", { className: c.name, children: server.serverName }),
              jsx("span", { className: c.tag, children: server.transport }),
            ] }),
            jsxs("span", { className: c.meta, children: [
              server.transport === "streamable-http" ? server.url : server.command,
              " · ",
              server.mounted ? `已连接 · ${server.toolCount} 个工具` : "未挂载",
            ] }),
            jsxs("span", { className: c.rowActions, children: [
              jsx("button", { type: "button", className: c.small, disabled: busy, onClick: () => startEdit(server), children: "编辑" }),
              jsx("button", { type: "button", className: c.danger, disabled: busy, onClick: () => remove(server.serverName), children: "删除" }),
            ] }),
          ] }),
        ] }, server.serverName);
      };

      const rows = servers === null
        ? jsx("div", { className: c.empty, children: "加载中…" })
        : servers.length === 0
          ? jsx("div", { className: c.empty, children: "尚未配置任何 MCP 服务器。在下方添加一个 Streamable HTTP 或 stdio 服务器。" })
          : jsx("ul", { className: c.rows, children: servers.map(renderServerRow) });

      return jsxs("div", { className: c.section, children: [
        jsx("h2", { className: c.title, children: "MCP 管理" }),
        jsx("p", { className: c.intro, children: "配置 MCP 服务器(Streamable HTTP 或 stdio)。连接成功后,服务器提供的工具会以 mcp__<serverName>__<toolName> 的形式出现在模型工具列表中;也可以让 agent 通过 mcp_manage 工具管理,或直接编辑 $DSH_HOME/settings.yaml 的 mcp: 段。请求头的值不会回显,编辑时留空表示保持不变。" }),
        message !== null && jsx("p", { className: message.kind === "error" ? c.error : c.notice, children: message.text }),
        rows,
        jsxs("div", { className: c.editor, children: [
          jsx("div", { className: c.editorTitle, children: "添加服务器" }),
          jsx("div", { className: c.field, children: [
            jsx("label", { className: c.fieldLabel, children: "服务器名称 (serverName)" }),
            jsx("input", { className: c.input, value: draft.serverName, onChange: setField("serverName"), placeholder: "例如: my-server", disabled: busy }),
          ] }),
          jsx("div", { className: c.field, children: [
            jsx("label", { className: c.fieldLabel, children: "传输方式 (transport)" }),
            jsx("select", { className: c.input, value: draft.transport, onChange: setField("transport"), disabled: busy, children: [
              jsx("option", { value: "streamable-http", children: "Streamable HTTP" }),
              jsx("option", { value: "stdio", children: "stdio" }),
            ] }),
          ] }),
          draft.transport === "streamable-http"
            ? jsx("div", { className: c.field, children: [
                jsx("label", { className: c.fieldLabel, children: "URL" }),
                jsx("input", { className: c.input, value: draft.url, onChange: setField("url"), placeholder: "例如: http://localhost:3000/mcp", disabled: busy }),
              ] })
            : jsx("div", { className: c.field, children: [
                jsx("label", { className: c.fieldLabel, children: "启动命令 (command)" }),
                jsx("input", { className: c.input, value: draft.command, onChange: setField("command"), placeholder: "例如: npx -y @modelcontextprotocol/server-github", disabled: busy }),
              ] }),
          draft.transport === "streamable-http"
            ? jsx("div", { className: c.field, children: [
                jsx("label", { className: c.fieldLabel, children: "请求头 (headers, JSON 对象,可选)" }),
                jsx("textarea", { className: c.textarea, value: draft.headers, onChange: setField("headers"), placeholder: '例如: {"Authorization": "Bearer sk-xxx"}', disabled: busy }),
              ] })
            : null,
          jsx("div", { className: c.field, children: [
            jsx("label", { className: c.fieldLabel, children: "工具调用超时 (ms,可选)" }),
            jsx("input", { className: c.input, value: draft.toolCallTimeoutMs, onChange: setField("toolCallTimeoutMs"), placeholder: "默认 60000", disabled: busy }),
          ] }),
          jsx("div", { className: c.editorActions, children: [
            jsx("button", { type: "button", className: `${c.button} ${c.primary}`, disabled: busy, onClick: submit, children: "添加服务器" }),
            jsx("button", { type: "button", className: `${c.button} ${c.secondary}`, disabled: busy, onClick: refresh, children: "刷新状态" }),
          ] }),
        ] }),
      ] });
    }

    // ---------- plugin ----------
    const inject = ["slots"];

    function apply(ctx) {
      ctx.slots.inject("settings.section", () => ctx.slots.register({
        name: "settings.section",
        id: "mcp",
        order: 25,
        label: "MCP管理",
      }, McpSection));
    }

    exports.apply = apply;
    exports.inject = inject;
    return module.exports;
  },
});
