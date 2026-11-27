---
id: "c198b6e1-15d6-47ba-abbf-57d52c1c4cce"
type: "requirement"
label: "Mail at the domain"
action: "receive and send mail as contact@isostride.com through Zoho Mail (EU), the domain's mail records (Zoho's verification, MX, SPF, DKIM, DMARC) kept in Route 53 through Terraform with the rest of the infrastructure; give the address on the site, in English and Polish"
ears_type: "ubiquitous"
rationale: "The runner asked: \"chce dolozyc adres mailowy contact@isostride.com ... mam zoho mail\", showing Zoho's step to add the TXT record zoho-verification=zb95419137.zmverify.zoho.eu at the domain, and chose \"przez terraform\"; then gave Zoho's DKIM key (selector zmail) and asked: \"dodaj contact na stronie\". Model's choices: the values in infra/mail.json, read by infra/mail.tf; Zoho's EU servers mx.zoho.eu, mx2.zoho.eu, mx3.zoho.eu with priorities 10, 20, 50 (TTL 3600); SPF \"v=spf1 include:zohomail.eu ~all\" in the same TXT record set as the verification, as Route 53 keeps one per name; DMARC p=none with reports to contact@isostride.com; a DKIM key longer than 255 characters split into strings of one record; on the site the address in the footer, beside the app's host, as a mailto link."
---
