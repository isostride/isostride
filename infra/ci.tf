# The check of the pipeline (the runner's request of 23 Nov 2026: "chce przeniesc wszystko na pipleline i
# miec poprawne ci/cd", the test FIT files in "Prywatny bucket S3"): the runner's FIT files, kept out of
# the public repository, in a private bucket that the check job reads with a role of its own.

data "aws_caller_identity" "me" {}

resource "aws_s3_bucket" "test_data" {
  bucket = "isostride-test-data-${data.aws_caller_identity.me.account_id}"
}

resource "aws_s3_bucket_public_access_block" "test_data" {
  bucket                  = aws_s3_bucket.test_data.id
  block_public_acls       = true
  block_public_policy     = true
  ignore_public_acls      = true
  restrict_public_buckets = true
}

resource "aws_s3_bucket_ownership_controls" "test_data" {
  bucket = aws_s3_bucket.test_data.id
  rule { object_ownership = "BucketOwnerEnforced" }
}

resource "aws_s3_bucket_server_side_encryption_configuration" "test_data" {
  bucket = aws_s3_bucket.test_data.id
  rule {
    apply_server_side_encryption_by_default { sse_algorithm = "AES256" }
  }
}

# Taken by the check job: on the deploy branch and on pull requests of this repository (a fork's pull
# request gets no OIDC token), only able to read the test data.
data "aws_iam_policy_document" "ci_trust" {
  statement {
    actions = ["sts:AssumeRoleWithWebIdentity"]
    principals {
      type        = "Federated"
      identifiers = [local.github_oidc_arn]
    }
    condition {
      test     = "StringEquals"
      variable = "token.actions.githubusercontent.com:aud"
      values   = ["sts.amazonaws.com"]
    }
    condition {
      test     = "StringEquals"
      variable = "token.actions.githubusercontent.com:sub"
      values = [
        "${local.github_subject}:ref:refs/heads/${var.github_branch}",
        "${local.github_subject}:pull_request",
      ]
    }
  }
}

resource "aws_iam_role" "ci" {
  name                 = "isostride-ci"
  assume_role_policy   = data.aws_iam_policy_document.ci_trust.json
  max_session_duration = 3600
}

data "aws_iam_policy_document" "ci" {
  statement {
    actions   = ["s3:ListBucket"]
    resources = [aws_s3_bucket.test_data.arn]
  }
  statement {
    actions   = ["s3:GetObject"]
    resources = ["${aws_s3_bucket.test_data.arn}/*"]
  }
}

resource "aws_iam_role_policy" "ci" {
  name   = "read-test-data"
  role   = aws_iam_role.ci.id
  policy = data.aws_iam_policy_document.ci.json
}
