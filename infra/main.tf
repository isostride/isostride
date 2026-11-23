# IsoStride on AWS (the runner's request of 23 Nov 2026: "route 53 z domena, cloudfront i pozniej s3
# bucket", then "aplikacja bedzie wystawiona jako app.isostride.com a strona na isostride.com" and
# "strona ma byc w tym samym repo ... ma byc to monorepo"): the app (apps/app) at app.<domain>, the site
# (apps/site) at <domain> with www sent to it, one certificate for both; both deployed by the workflow
# of this repository (.github/workflows/deploy.yml).

# The hosted zone: the one Route 53 made when it registered the domain, or, for a domain of another
# registrar, one made here, its name servers to be set at that registrar (output name_servers).
data "aws_route53_zone" "registered" {
  count        = var.create_hosted_zone ? 0 : 1
  name         = var.domain_name
  private_zone = false
}

resource "aws_route53_zone" "this" {
  count = var.create_hosted_zone ? 1 : 0
  name  = var.domain_name
}

locals {
  zone_id      = var.create_hosted_zone ? aws_route53_zone.this[0].zone_id : data.aws_route53_zone.registered[0].zone_id
  name_servers = var.create_hosted_zone ? aws_route53_zone.this[0].name_servers : data.aws_route53_zone.registered[0].name_servers
}

resource "aws_acm_certificate" "this" {
  provider                  = aws.us_east_1
  domain_name               = var.domain_name
  subject_alternative_names = ["*.${var.domain_name}"]
  validation_method         = "DNS"
  lifecycle { create_before_destroy = true }
}

# <domain> and *.<domain> are validated by one and the same record: the one of <domain>, keyed by the
# name (known at plan, unlike the record's own name).
resource "aws_route53_record" "validation" {
  for_each        = { for o in aws_acm_certificate.this.domain_validation_options : o.domain_name => o if o.domain_name == var.domain_name }
  zone_id         = local.zone_id
  name            = each.value.resource_record_name
  type            = each.value.resource_record_type
  records         = [each.value.resource_record_value]
  ttl             = 300
  allow_overwrite = true
}

resource "aws_acm_certificate_validation" "this" {
  provider                = aws.us_east_1
  certificate_arn         = aws_acm_certificate.this.arn
  validation_record_fqdns = [for r in aws_route53_record.validation : r.fqdn]
}

# The app: its static export, /run read as run.html.
module "app" {
  source          = "./modules/static-site"
  name            = "app"
  aliases         = ["app.${var.domain_name}"]
  zone_id         = local.zone_id
  certificate_arn = aws_acm_certificate_validation.this.certificate_arn
  function_code   = file("${path.module}/functions/app.js")
}

# The site: the domain itself, www sent to it.
module "site" {
  source          = "./modules/static-site"
  name            = "site"
  aliases         = [var.domain_name, "www.${var.domain_name}"]
  zone_id         = local.zone_id
  certificate_arn = aws_acm_certificate_validation.this.certificate_arn
  function_code   = file("${path.module}/functions/site.js")
}
