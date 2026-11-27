---
id: "d7bd17b7-f923-4637-9a9a-1d7eeb2cdcbe"
type: "scenario"
label: "Zoho Mail's records of the domain"
given: "the mail records of infra/mail.json and infra/mail.tf"
then: "mail goes to mx.zoho.eu, mx2.zoho.eu and mx3.zoho.eu in that order; one TXT record set at the domain holds Zoho's verification and one SPF that lets Zoho send; DMARC is set; DKIM, when set, is a DKIM1 key; each record is made from those values"
when: "Terraform makes the records of isostride.com"
---
