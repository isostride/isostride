output "app_url" {
  value = "https://app.${var.domain_name}"
}

output "site_url" {
  value = "https://${var.domain_name}"
}

output "app_bucket" {
  description = "GitHub variable APP_BUCKET"
  value       = module.app.bucket
}

output "app_distribution_id" {
  description = "GitHub variable APP_DISTRIBUTION_ID"
  value       = module.app.distribution_id
}

output "deploy_role_arn" {
  description = "GitHub variable AWS_DEPLOY_ROLE_ARN"
  value       = aws_iam_role.deploy.arn
}

output "site_bucket" {
  description = "GitHub variable SITE_BUCKET"
  value       = module.site.bucket
}

output "site_distribution_id" {
  description = "GitHub variable SITE_DISTRIBUTION_ID"
  value       = module.site.distribution_id
}

output "name_servers" {
  description = "For a domain registered outside Route 53: the name servers to set at its registrar"
  value       = local.name_servers
}

output "ci_role_arn" {
  description = "GitHub variable AWS_CI_ROLE_ARN"
  value       = aws_iam_role.ci.arn
}

output "test_data_bucket" {
  description = "GitHub variable TEST_DATA_BUCKET; filled from apps/app/test_data (infra/README.md)"
  value       = aws_s3_bucket.test_data.bucket
}
