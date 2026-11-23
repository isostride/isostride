terraform {
  required_version = ">= 1.10"
  required_providers {
    aws = { source = "hashicorp/aws", version = "~> 6.0" }
  }
  # The state lives in the bucket of bootstrap/: terraform init -backend-config="bucket=<its name>"
  backend "s3" {
    key          = "isostride/sites.tfstate"
    region       = "eu-central-1"
    use_lockfile = true
    encrypt      = true
  }
}

provider "aws" {
  region  = var.aws_region
  profile = var.aws_profile
  default_tags { tags = { Project = "isostride" } }
}

# CloudFront takes its certificates from us-east-1 only.
provider "aws" {
  alias   = "us_east_1"
  region  = "us-east-1"
  profile = var.aws_profile
  default_tags { tags = { Project = "isostride" } }
}
