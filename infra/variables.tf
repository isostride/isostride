variable "domain_name" {
  description = "The domain: the site at it, the app at app.<it>"
  type        = string
}

variable "create_hosted_zone" {
  description = "true for a domain registered outside Route 53: the hosted zone is made here, its name servers set at the registrar; false when Route 53 registered it (and made the zone)"
  type        = bool
  default     = false
}

variable "aws_region" {
  description = "Where the bucket lives"
  type        = string
  default     = "eu-central-1"
}

variable "aws_profile" {
  description = "The AWS CLI profile to work as; null for the default credentials"
  type        = string
  default     = null
}

variable "github_repository" {
  description = "The repository whose workflow deploys the sites (owner/name, as GitHub names it; change it with a rename on GitHub)"
  type        = string
  default     = "isostride/isostride"
}

variable "github_repository_ids" {
  description = "The ids of the owner and of the repository, which GitHub puts beside their names in the OIDC subject (repo:<owner>@<id>/<name>@<id>:…): gh api repos/<owner>/<name> --jq '.owner.id, .id'"
  type        = object({ owner = number, repository = number })
  default     = { owner = 348399734, repository = 1467002530 }
}

variable "github_branch" {
  type    = string
  default = "master"
}

variable "create_github_oidc_provider" {
  description = "false when the account already has GitHub's OIDC provider (token.actions.githubusercontent.com)"
  type        = bool
  default     = true
}
