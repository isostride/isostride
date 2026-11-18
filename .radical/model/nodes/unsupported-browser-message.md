---
id: "063a771e-2d84-49e2-8c92-d15fc52a2bce"
type: "requirement"
label: "Unsupported browser message"
action: "show a message that the browser is not supported and not start the application"
ears_type: "unwanted-behaviour"
rationale: "Folder access (showDirectoryPicker) works only in Chrome, Edge and Opera; the user chose a clear message over a degraded mode."
unwanted_condition: "the application is opened in a browser other than Chrome, Edge or Opera (one without the File System Access API)"
---
