# A static site: a private S3 bucket read by CloudFront only, HTTPS with the usual security headers,
# a viewer-request function for its paths, and its names in Route 53.
terraform {
  required_providers {
    aws = { source = "hashicorp/aws", version = "~> 6.0" }
  }
}

variable "name" {
  description = "Short name: the bucket isostride-<name>-<account>, the CloudFront resources isostride-<name>"
  type        = string
}

variable "aliases" {
  description = "The host names it answers, the first the main one"
  type        = list(string)
}

variable "zone_id" {
  type = string
}

variable "certificate_arn" {
  description = "A validated certificate in us-east-1 covering the aliases"
  type        = string
}

variable "content_security_policy" {
  description = "The Content-Security-Policy header of every answer"
  type        = string
}

variable "function_code" {
  description = "The CloudFront Function (cloudfront-js-2.0) run on each viewer request"
  type        = string
}

data "aws_caller_identity" "me" {}

resource "aws_s3_bucket" "this" {
  bucket = "isostride-${var.name}-${data.aws_caller_identity.me.account_id}"
}

resource "aws_s3_bucket_public_access_block" "this" {
  bucket                  = aws_s3_bucket.this.id
  block_public_acls       = true
  block_public_policy     = true
  ignore_public_acls      = true
  restrict_public_buckets = true
}

resource "aws_s3_bucket_ownership_controls" "this" {
  bucket = aws_s3_bucket.this.id
  rule { object_ownership = "BucketOwnerEnforced" }
}

resource "aws_s3_bucket_server_side_encryption_configuration" "this" {
  bucket = aws_s3_bucket.this.id
  rule {
    apply_server_side_encryption_by_default { sse_algorithm = "AES256" }
  }
}

resource "aws_s3_bucket_versioning" "this" {
  bucket = aws_s3_bucket.this.id
  versioning_configuration { status = "Enabled" }
}

# Old versions of the files kept a month, for a rollback.
resource "aws_s3_bucket_lifecycle_configuration" "this" {
  bucket = aws_s3_bucket.this.id
  rule {
    id     = "old-versions"
    status = "Enabled"
    filter {}
    noncurrent_version_expiration { noncurrent_days = 30 }
  }
}

resource "aws_cloudfront_origin_access_control" "this" {
  name                              = "isostride-${var.name}"
  origin_access_control_origin_type = "s3"
  signing_behavior                  = "always"
  signing_protocol                  = "sigv4"
}

data "aws_iam_policy_document" "read" {
  statement {
    actions   = ["s3:GetObject"]
    resources = ["${aws_s3_bucket.this.arn}/*"]
    principals {
      type        = "Service"
      identifiers = ["cloudfront.amazonaws.com"]
    }
    condition {
      test     = "StringEquals"
      variable = "AWS:SourceArn"
      values   = [aws_cloudfront_distribution.this.arn]
    }
  }
}

resource "aws_s3_bucket_policy" "this" {
  bucket = aws_s3_bucket.this.id
  policy = data.aws_iam_policy_document.read.json
}

resource "aws_cloudfront_function" "paths" {
  name    = "isostride-${var.name}-paths"
  runtime = "cloudfront-js-2.0"
  publish = true
  code    = var.function_code
}

resource "aws_cloudfront_response_headers_policy" "this" {
  name = "isostride-${var.name}-security"
  security_headers_config {
    strict_transport_security {
      access_control_max_age_sec = 31536000
      include_subdomains         = true
      preload                    = false
      override                   = true
    }
    content_type_options { override = true }
    frame_options {
      frame_option = "DENY"
      override     = true
    }
    referrer_policy {
      referrer_policy = "strict-origin-when-cross-origin"
      override        = true
    }
    # Where the pages may load from and connect to (infra/csp.json, the policy the end-to-end tests run
    # under too): a script that got into a page cannot load another from elsewhere nor send what the app
    # holds (the folder, the COROS tokens) to a host of its own.
    content_security_policy {
      content_security_policy = var.content_security_policy
      override                = true
    }
  }
}

resource "aws_cloudfront_distribution" "this" {
  enabled             = true
  is_ipv6_enabled     = true
  http_version        = "http2and3"
  price_class         = "PriceClass_100"
  default_root_object = "index.html"
  aliases             = var.aliases
  comment             = "Isostride · ${var.name}"

  origin {
    origin_id                = "s3"
    domain_name              = aws_s3_bucket.this.bucket_regional_domain_name
    origin_access_control_id = aws_cloudfront_origin_access_control.this.id
  }

  default_cache_behavior {
    target_origin_id       = "s3"
    viewer_protocol_policy = "redirect-to-https"
    allowed_methods        = ["GET", "HEAD", "OPTIONS"]
    cached_methods         = ["GET", "HEAD"]
    compress               = true
    # AWS managed CachingOptimized: it follows the Cache-Control each file is uploaded with.
    cache_policy_id            = "658327ea-f89d-4fab-a63d-7e88639e58f6"
    response_headers_policy_id = aws_cloudfront_response_headers_policy.this.id
    function_association {
      event_type   = "viewer-request"
      function_arn = aws_cloudfront_function.paths.arn
    }
  }

  # S3 answers 403 for a file it does not hold (CloudFront may not list the bucket): the site's 404 page.
  custom_error_response {
    error_code         = 403
    response_code      = 404
    response_page_path = "/404.html"
  }
  custom_error_response {
    error_code         = 404
    response_code      = 404
    response_page_path = "/404.html"
  }

  restrictions {
    geo_restriction { restriction_type = "none" }
  }

  viewer_certificate {
    acm_certificate_arn      = var.certificate_arn
    ssl_support_method       = "sni-only"
    minimum_protocol_version = "TLSv1.2_2021"
  }
}

# Each name, IPv4 and IPv6, to the distribution.
resource "aws_route53_record" "this" {
  for_each = { for p in setproduct(var.aliases, ["A", "AAAA"]) : "${p[0]}-${p[1]}" => { name = p[0], type = p[1] } }
  zone_id  = var.zone_id
  name     = each.value.name
  type     = each.value.type
  alias {
    name                   = aws_cloudfront_distribution.this.domain_name
    zone_id                = aws_cloudfront_distribution.this.hosted_zone_id
    evaluate_target_health = false
  }
}

output "bucket" {
  value = aws_s3_bucket.this.bucket
}

output "bucket_arn" {
  value = aws_s3_bucket.this.arn
}

output "distribution_id" {
  value = aws_cloudfront_distribution.this.id
}

output "distribution_arn" {
  value = aws_cloudfront_distribution.this.arn
}
