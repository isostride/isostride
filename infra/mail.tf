# Mail at the domain (the runner's request of 27 Nov 2026: "chce dolozyc adres mailowy
# contact@isostride.com ... mam zoho mail", then "przez terraform"): Zoho Mail's records, their values in
# mail.json. Zoho's DKIM key is set there ("dkim": { "selector": "zmail", "value": "v=DKIM1; k=rsa; p=…" })
# once Zoho shows it; until then no DKIM record is made.

locals {
  mail = jsondecode(file("${path.module}/mail.json"))
}

resource "aws_route53_record" "mail_mx" {
  zone_id = local.zone_id
  name    = var.domain_name
  type    = "MX"
  ttl     = 3600
  records = local.mail.mx
}

# One TXT record set per name in Route 53: Zoho's verification and SPF side by side. allow_overwrite takes
# over a record set made by hand in the console.
resource "aws_route53_record" "mail_txt" {
  zone_id         = local.zone_id
  name            = var.domain_name
  type            = "TXT"
  ttl             = 300
  records         = local.mail.txt
  allow_overwrite = true
}

resource "aws_route53_record" "mail_dmarc" {
  zone_id = local.zone_id
  name    = "_dmarc.${var.domain_name}"
  type    = "TXT"
  ttl     = 300
  records = [local.mail.dmarc]
}

# A DKIM key is longer than one TXT string may be (255 characters): split into strings of one record.
resource "aws_route53_record" "mail_dkim" {
  for_each = { for k in local.mail.dkim == null ? [] : [local.mail.dkim] : k.selector => k.value }
  zone_id  = local.zone_id
  name     = "${each.key}._domainkey.${var.domain_name}"
  type     = "TXT"
  ttl      = 300
  records  = [join("\"\"", regexall(".{1,255}", each.value))]
}
