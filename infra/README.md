# Isostride on AWS

Terraform for the two static sites of the monorepo and for their pipeline, each site served from a private S3 bucket through CloudFront over HTTPS:

| Name | What | From |
| --- | --- | --- |
| `app.<domain>` | the app | `apps/app` (`npm run build:app`, `.next-build`) |
| `<domain>`, `www.<domain>` → `<domain>` | the site | `apps/site` (`npm run build:site`, `.next-build`) |

One certificate (ACM, us-east-1) covers `<domain>` and `*.<domain>`. A CloudFront Function reads `/run` as `run.html`, as the static export lays the pages out. The deploy workflow (`.github/workflows/deploy.yml`) signs in with GitHub OIDC: no AWS keys are kept in GitHub.

## Once

1. **Domain.** Register it in Route 53 (console → Route 53 → Registered domains → Register domains). Turn on privacy protection and auto-renew. Registration also creates the hosted zone that Terraform uses. A `.com` costs about 15 USD a year.
2. **AWS CLI.** Sign in with a profile for this account, e.g. `aws configure sso --profile isostride`, then `aws sts get-caller-identity --profile isostride`.
3. **State bucket.**
   ```sh
   cd infra/bootstrap
   terraform init
   terraform apply -var aws_profile=isostride     # prints state_bucket
   ```
4. **The sites.**
   ```sh
   cd infra
   cp example.tfvars terraform.tfvars               # domain_name, aws_profile
   terraform init -backend-config="bucket=<state_bucket>" -backend-config="profile=isostride"
   terraform plan
   terraform apply                                  # the certificate and CloudFront take 5–20 minutes
   ```
   If the account already has GitHub's OIDC provider (`token.actions.githubusercontent.com`), set `create_github_oidc_provider = false`.
   If the domain is registered in another account (or at another registrar), set `create_hosted_zone = true`: apply the zone first (`terraform apply -target=aws_route53_zone.this`), set the domain's name servers to `terraform output name_servers`, then apply the rest. A domain can move to another AWS account only 60 days after its registration.
   GitHub names the repository in the OIDC subject with its ids (`repo:<owner>@<id>/<name>@<id>:…`); for another repository set `github_repository` and `github_repository_ids` (`gh api repos/<owner>/<name> --jq '.owner.id, .id'`).
5. **Test data.** The check runs on the runner's FIT files, which stay out of the public repository: copy them to the private bucket (again whenever they change):
   ```sh
   aws s3 sync apps/app/test_data "s3://$(terraform -chdir=infra output -raw test_data_bucket)" --delete --profile isostride \
     --exclude "*.DS_Store" --exclude "*/.isostride/*" --exclude "*/strideprism/*"
   ```
6. **GitHub.** In the repository → Settings → Secrets and variables → Actions → Variables, add the values of `terraform output`:
   `AWS_DEPLOY_ROLE_ARN`, `AWS_CI_ROLE_ARN`, `TEST_DATA_BUCKET`, `APP_BUCKET`, `APP_DISTRIBUTION_ID`, `SITE_BUCKET`, `SITE_DISTRIBUTION_ID` (and `AWS_REGION` if not `eu-central-1`).

From then on every push and pull request runs the whole check (`npm run check`: every test, boundaries, budgets, `radical check`) on GitHub, and a push to `master` that passes it deploys the build it checked (`.github/workflows/deploy.yml`, CI/CD). The workflow can also be started by hand (Actions → CI/CD → Run workflow). The check's stages run as jobs side by side (unit and integration tests, the shuffled run, three shards of the end-to-end tests, the static checks); their reports reach the verdict through the same private bucket (`ci/<run>/`, deleted after 3 days). The logs of a public repository are public: no reports, traces or screenshots are published from it.

## Costs

The hosted zone costs 0.50 USD a month and the domain its yearly fee. The certificate is free. For a site this size, S3 and CloudFront cost cents a month: CloudFront's free tier covers 1 TB of transfer and 10 million requests a month.
