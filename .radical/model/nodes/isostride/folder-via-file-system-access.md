---
id: "9643fda7-9e5f-487d-8b69-93dd16db3783"
type: "adr"
label: "Folder via File System Access"
alternatives: "File upload input (read-only); origin private file system (data not visible to the runner)."
consequences: "Firefox and Safari are not supported; on reopening the runner only confirms access."
context: "The app reads FIT files from, and writes its data to, a folder the runner chooses, and reopens it on later launches."
date: "2026-11-18"
decision: "Use the File System Access API (showDirectoryPicker) and remember the folder handle in IndexedDB; support only Chrome, Edge and Opera, with a not-supported message elsewhere."
status: "accepted"
---
