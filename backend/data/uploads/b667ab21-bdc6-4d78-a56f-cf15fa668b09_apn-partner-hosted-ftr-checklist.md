# Partner Hosted Foundational Technical Review

## Partner Hosted Validation Checklist

### Validity Period: February 2026-August 2026

This version of the checklist was released on February 26th, 2026. The next version of this checklist is expected to be released in August 2026. AWS Partners may continue to use this version of the checklist until November 2026. AWS Partners may submit applications using the previous release (August 2025) until May 27th, 2026. Please review the [change log](https://apn-checklists.s3.amazonaws.com/changelog/Validation_Checklist_Change_Log.pdf) for a list of changes (if any) since the previous version.

## Foundational Technical Review (FTR) is currently paused.

FTR is currently paused. We are actively working to reopen applications as quickly as possible and will notify you when application submission is available. We apologize for any inconvenience this may cause.

FTR is not required to list or sell your product or solution on AWS Marketplace. For more information, visit [AWS Marketplace Seller Guide](https://docs.aws.amazon.com/marketplace/latest/userguide/ml-publishing-your-product-in-aws-marketplace.html).

## Introduction

The Foundational Technical Review (FTR) assesses an AWS Partner's solution against a specific set of Amazon Web Services (AWS) best practices around security, performance, and operational processes that are most critical for customer success. Passing the FTR is required to qualify AWS Software Partners for AWS Partner Network (APN) programs such as AWS Competency and AWS Service Ready but any AWS Partner who offers a technology solution may request a FTR review through AWS Partner Central.

This checklist is applicable to solutions which are hosted by the Partner on AWS (for example, SaaS solutions). All critical application components must be hosted on AWS. If your solution does not meet these requirements, refer to the [Foundational Technical Review Checklist Index](https://apn-checklists.s3.amazonaws.com/foundational/index/all/CGFp311uG.html). You may use external providers for edge services such as content delivery networks (CDNs) or Domain Name System (DNSs), or corporate identity providers.

This checklist is also available in [Chinese-simplified](https://apn-checklists.s3.amazonaws.com/foundational/partner-hosted/partner-hosted/cn/CVLHEC5X7.html), [Chinese-traditional](https://apn-checklists.s3.amazonaws.com/foundational/partner-hosted/partner-hosted/tw/CVLHEC5X7.html), [Korean](https://apn-checklists.s3.amazonaws.com/foundational/partner-hosted/partner-hosted/ko/CVLHEC5X7.html), [Japanese](https://apn-checklists.s3.amazonaws.com/foundational/partner-hosted/partner-hosted/ja/CVLHEC5X7.html), [Portuguese](https://apn-checklists.s3.amazonaws.com/foundational/partner-hosted/partner-hosted/pt/CVLHEC5X7.html), and [Spanish](https://apn-checklists.s3.amazonaws.com/foundational/partner-hosted/partner-hosted/es/CVLHEC5X7.html).

## Expectations of parties

AWS Partners must review this document and the [FTR guide](https://partnercentral.awspartner.com/ContentFolderPartner?id=0690h00000BGRJhAAP) in detail before submitting an FTR request. If you have questions about this document, contact your Partner Development Representative (PDR) or Partner Development Manager (PDM). AWS reserves the right to make changes to this document at any time.

FTR requests must be submitted using AWS Partner Central. For more information on how to submit a request, [AWS Foundational Technical Review](https://aws.amazon.com/partners/foundational-technical-review/) and choose Request an FTR.

You can can also request an FTR using alternative manual process. For more information, refer to the [FTR guide](https://partnercentral.awspartner.com/ContentFolderPartner?id=0690h00000BGRJhAAP) on AWS Partner Central.

After you submit your Offering for a FTR review through AWS Partner Central, an AWS Partner Solutions Architect (PSA) will review your submitted documents and contact you via email. If the FTR self-assessment is submitted and all requirements are met, your FTR will be approved. If any requirements are not met, an AWS PSA will provide you with a list of remediation steps and guidance on how to complete your FTR. Your FTR will be approved after you implement all the remediations and provide confirmation to the PSA. If you don't remediate all FTR findings and receive FTR approval within six months, then you must submit your offering for a new FTR review which may be subject to additional controls due to changes in the validation checklist over time. In case of renewal, if you don't complete the FTR before the current FTR expiration date, your Offering being reviewed will be de-listed from Partner Solution Finder (PSF).

If you do not have an approved FTR for at least one Offering, then the account will be removed from the Validated+ stage in the AWS Software Path. When you are downgraded in the Software Path, you will lose the benefits of Validated Stage including access to APN Customer Engagements (ACE) and AWS ISV Accelerate programs.

## AWS Foundational Technical Review prerequisites

The following items will be verified by AWS before a technical validation is executed.

#### 1.1 Software Path Membership

AWS Partners must be enrolled in [Software Path](https://aws.amazon.com/partners/paths). AWS Systems Integrator (SI) Partners should talk to their PDR/PDM on how to join the Software Path.

## Partner-hosted FTR requirements

The following requirements apply to all Partner-hosted software products and must be met for an FTR to be approved.

## Architectural and Operational Controls

**Most of the below controls can be bypassed if you have completed an AWS Well-Architected Review (WAFR) or SOC2 Type II audit. The architecture review or audit must have been completed by an AWS employee, Well-Architected Partner Program (WAPP) partner, or a qualified SOC2 auditor. If you've already completed this process, please refer to the [FTR Alternative Validation Checklist](https://apn-checklists.s3.amazonaws.com/foundational/partner-hosted/partner-hosted-alternative/CwYryx6XW.html) for additional information.**

**The following requirements apply to any components hosted and operated by the AWS Partner in their own AWS account. The controls which include a Center for Internet Security(CIS) benchmark 5.0 ID are covered by the automated AWS account scan. If you are submitting CIS Benchmark v3.0, the quivalent controls are mentioned in the self-assessment sheet, please refer to the [mapping of controls to CIS requirements in each version](https://docs.aws.amazon.com/securityhub/latest/userguide/cis-aws-foundations-benchmark.html#cis1.4-vs-cis1.2) for additional information.**

#### ARC-001 - Use root user only by exception.

The root user has unlimited access to your account and its resources, and using it only by exception helps protect your AWS resources. The AWS root user must not be used for everyday tasks, even administrative ones. Instead, adhere to the [best practice of using the root user only to create your first AWS Identity and Access Management (IAM) user](https://docs.aws.amazon.com/IAM/latest/UserGuide/root-user-best-practices.html). Then securely lock away the root user credentials and use them to perform only a few accounts and service management tasks. To view the tasks that require you to sign in as the root user, see [AWS Tasks That Require Root User](https://docs.aws.amazon.com/general/latest/gr/aws_tasks-that-require-root.html). FTR does not require you to actively monitor root usage.

We recommend you use AWS Organizations to centralize AWS root accounts access. If you are using AWS Organizations to create new member accounts and centralize root access, you can choose to delete root user credentials for all member accounts in your organization. You can find more information on centrally managing root access [here](https://docs.aws.amazon.com/IAM/latest/UserGuide/id_root-user.html#id_root-user-access-management).

#### ARC-004 - Remove access keys for the root user. (CIS\_5.0 1.3/Security Control IAM.4 or CIS\_3.0 1.4/Security Control IAM.4)

Programmatic access to AWS APIs should never use the root user. It is best not to generate static an access key for the root user. If one already exists, you should transition any processes using that key to use temporary access keys from an AWS Identity and Access Management (IAM) role, or, if necessary, static access keys from an IAM user.

If you are using AWS Organizations for member account and not planning to centralize root access, then it is critical that access keys for root users are removed as [root user should only be used for specific tasks](https://docs.aws.amazon.com/IAM/latest/UserGuide/id_root-user.html#root-user-tasks) in your AWS account.

#### ARC-005 - Develop incident management plans.

An incident management plan is critical to respond, mitigate, and recover from the potential impact of security incidents. An incident management plan is a structured process for identifying, remediating, and responding in a timely matter to security incidents. An effective incident management plan must be continually iterated upon, remaining current with your cloud operations goal. For more information on developing incident management plan please see Develop [incident management plans](https://docs.aws.amazon.com/wellarchitected/latest/security-pillar/sec_incident_response_develop_management_plans.html).

#### ACOM-001 - Configure AWS account contacts. (CIS\_5.0 or CIS\_3.0 1.2/Security Control Account.1)

If an account is not managed by [AWS Organizations](https://aws.amazon.com/organizations/), alternate account contacts help AWS get in contact with the appropriate personnel if needed. Configure the account's [alternate contacts](http://docs.aws.amazon.com/awsaccountbilling/latest/aboutv2/manage-account-payment.html#account-contacts) to point to a group rather than an individual. For example, create separate email distribution lists for billing, operations, and security and configure these as Billing, Security, and Operations contacts in each active AWS account. This ensures that multiple people will receive AWS notifications and be able to respond, even if someone is on vacation, changes roles, or leaves the company.

#### ACOM-002 - Set account contact information including the root user email address to email addresses and phone numbers owned by your company.

Using company owned email addresses and phone numbers for contact information enables you to access them even if the individuals whom they belong to are no longer with your organization.

#### IAM-001 - Enable multi-factor authentication (MFA) for all Human Identities with AWS access. (CIS\_5.0 1.9/Security Control IAM.5 or CIS\_3.0 1.10/Security Control IAM.5)

You must require any human identities to authenticate using MFA before accessing your AWS accounts. Typically, this means enabling MFA within your corporate identity provider. If you have existing legacy IAM users you must enable MFA for console access for those principals as well. Enabling MFA for IAM users provides an additional layer of security. With MFA, users have a device that generates a unique authentication code (a one-time password, or OTP). Users must provide both their normal credentials (user name and password) and the OTP. The MFA device can either be a special piece of hardware, or it can be a virtual device (for example, it can run in an app on a smartphone). Please note that machine identities do not require MFA.

#### IAM-002 - Monitor and secure static AWS Identity and Access Management (IAM) credentials. (CIS\_5.0 1.13/Security Control IAM.3 or CIS\_3.0 1.14/Security Control IAM.3)

Monitor and secure AWS IAM credentials by:

- Using IAM roles to reduce the risk of credentials being misused OR
- Rotating IAM access keys regularly (recommended at least every 90 days)

In cases where it is infeasible to use IAM roles or rotate keys, implement the following controls:

- Maintain an inventory of all static keys and where they are used and remove unused access keys.
- Implement monitoring of AWS CloudTrail logs to detect anomalous activity or other potential misuse (e.g. using AWS GuardDuty.)
- Define a runbook or SOP for revoking credentials in the event you detect misuse.

See [Managing access keys for IAM users](https://docs.aws.amazon.com/IAM/latest/UserGuide/id_credentials_access-keys.html) for more information.

#### IAM-003 - Use strong password policy. ([CIS\_5.0 1.7/Security Control IAM.15 and CIS\_5.0 1.8/Security Control IAM.16] or [CIS\_3.0 1.8/Security Control IAM.15 and CIS\_3.0 1.9/Security Control IAM.16])

Enforce a strong password policy, and educate users to avoid common or re-used passwords. For IAM users, you can create a password policy for your account on the Account Settings page of the IAM console. You can use the password policy to define password requirements, such as minimum length and whether it requires non-alphabetic characters, and so on. For more information, see [Setting an Account Password Policy for IAM users](https://docs.aws.amazon.com/IAM/latest/UserGuide/id_credentials_passwords_account-policy.html).

#### IAM-004 - Create individual identities (no shared credentials) for anyone who needs AWS access.

Create individual entities and give unique security credentials and permissions to each user accessing your account. With individual entities and no shared credentials, you can audit the activity of each user.

#### IAM-005 - Use IAM roles and its temporary security credentials to provide access to third parties.

Do not provision IAM users and share those credentials with people outside of your organization. Any external services that need to make AWS API calls against your account (for example, a monitoring solution that accesses your account's AWS CloudWatch metrics) must use a cross-account role. For more information, refer to [Providing access to AWS accounts owned by third parties](https://docs.aws.amazon.com/IAM/latest/UserGuide/id_roles_common-scenarios_third-party.html).

#### IAM-006 - Grant least privilege access.

You must follow the standard security advice of [granting least privilege](https://docs.aws.amazon.com/IAM/latest/UserGuide/best-practices.html#grant-least-privilege). Grant only the access that identities require by allowing access to specific actions on specific AWS resources under specific conditions. Rely on groups and identity attributes to dynamically set permissions at scale, rather than defining permissions for individual users. For example, you can allow a group of developers access to manage only resources for their project. This way, when a developer is removed from the group, access for the developer is revoked everywhere that group was used for access control, without requiring any changes to the access policies.

#### IAM-007 - Manage access based on life cycle.

Integrate access controls with operator and application lifecycle and your centralized federation provider and IAM. For example, remove a user's access when they leave the organization or change roles.

#### IAM-008 - Audit identities quarterly.

Auditing the identities that are configured in your identity provider and IAM helps ensure that only authorized identities have access to your workload. For example, remove people that leave the organization, and remove cross-account roles that are no longer required. Have a process in place to periodically audit permissions to the services accessed by an IAM entity. This helps you identify the policies you needto modify to remove any unused permissions. For more information, see [Refining permissions in AWS using last accessed information](https://docs.aws.amazon.com/IAM/latest/UserGuide/access_policies_access-advisor.html).

#### IAM-009 - Do not embed credentials in application code.

Ensure that all credentials used by your applications (for example, IAM access keys and database passwords) are never included in your application's source code or committed to source control in any way.

#### IAM-010 - Store secrets securely.

Encrypt all secrets in transit and at rest, define fine-grained access controls that only allow access to specific identities, and log access to secrets in an audit log. We recommend you use a purpose-built secret management service such as [AWS Secrets Manager](https://aws.amazon.com/secrets-manager/), [AWS Systems Manager Parameter Store](https://docs.aws.amazon.com/systems-manager/latest/userguide/systems-manager-parameter-store.html), or an AWS Partner solution, but internally developed solutions that meet these requirements are also acceptable.

#### IAM-011 - Encrypt all end user/customer credentials and hash passwords at rest.

If you are storing end user/customer credentials in a database that you manage, encrypt credentials at rest and hash passwords. As an alternative, AWS recommends using a user-identity synchronization service, such as Amazon Cognito or an equivalent AWS Partner solution.

#### IAM-012 - Use temporary credentials for applications that run on AWS to access other AWS resources

Use [temporary security credentials](https://docs.aws.amazon.com/IAM/latest/UserGuide/id_credentials_temp.html) to access AWS resources.

- Use IAM roles to acquire temporary security credentials for machine identities within AWS, such as Amazon EC2 instances or AWS Lambda functions.
- All processes that run on AWS compute services should use temporary credentials from an associated IAM role to call AWS APIs.

#### SECOPS-001 - Perform vulnerability management.

Define a mechanism and frequency to scan and patch for vulnerabilities in your dependencies, and in your operating systems to help protect against new threats. Scan and patch your dependencies, and your operating systems on a defined schedule. Software vulnerability management is essential to keeping your system secure from threat actors. Embedding vulnerability assessments early into your continuous integration/continuous delivery (CI/CD) pipeline allows you to prioritize remediation of any security vulnerabilities detected. The solution you need to achieve this varies according to the AWS services that you are consuming. To check for vulnerabilities in software running in Amazon EC2 instances, you can add [Amazon Inspector](https://aws.amazon.com/inspector/) to your pipeline to cause your build to fail if Inspector detects vulnerabilities. You can also use open source products such as [OWASP Dependency-Check](https://owasp.org/www-project-dependency-check/), [Snyk](https://snyk.io/product/open-source-security-management), [OpenVAS](https://www.openvas.org/), package managers and AWS Partner tools for vulnerability management.

#### NETSEC-001 - Implement the least permissive rules for all Amazon EC2 security groups.

All Amazon EC2 security groups should restrict access to the greatest degree possible. At a minimum, do the following:

- Ensure that no security groups allow ingress from 0.0.0.0/0 to port 22 or 3389

  ([CIS\_5.0 5.4/ Security Control EC2.54 and CIS\_5.0 5.3/ Security Control EC2.53] or [CIS\_3.0 5.3/ Security Control EC2.54 and CIS\_3.0 5.2/ Security Control EC2.53])

- Ensure that the default security group of every VPC restricts all traffic

  (CIS\_5.0 5.5/Security Control EC2.2 or CIS\_3.0 5.4/Security Control EC2.2)

#### NETSEC-002 - Restrict resources in public subnets.

Do not place resources in public subnets of your VPC unless they must receive network traffic from public sources. Public subnets are subnets associated with a route table that has a route to an internet gateway.

#### BAR-001 - Configure automatic data backups.

You must perform regular backups to a durable storage service. Backups ensure that you have the ability to recover from administrative, logical, or physical error scenarios. Configure backups to be taken automatically based on a periodic schedule, or by changes in the dataset. RDS instances, EBS volumes, DynamoDB tables, and S3 objects can all be configured for automatic backup. AWS Backup, [AWS Marketplace](https://aws.amazon.com/marketplace) solutions or third-party solutions can also be used. If objects in S3 bucket are write-once-read-many (WORM), compensating controls such as object lock can be used meet this requirement. If it is customers' responsibility to backup their data, it must be clearly stated in the documentation and the Partner must provide clear instructions on how to backup the data.

#### BAR-002 - Periodically recover data to verify the integrity of your backup process.

To confirm that your backup process meets your recovery time objectives (RTO) and recovery point objectives (RPO), run a recovery test on a regular schedule and after making significant changes to your cloud environment. For more information, refer to [Getting Started - Backup and Restore with AWS](https://aws.amazon.com/backup-restore/getting-started/).

#### RES-001 - Define a Recovery Point Objective (RPO).

Define an RPO based on your organization's data-loss tolerance (as measured by time).

**Enter your RPO in the Partner Response column of the self-assessment worksheet.**

#### RES-002 - Establish a Recovery Time Objective (RTO).

Define an RTO that meets your organization's needs and expectations. RTO is the maximum acceptable delay your organization will accept between the interruption and restoration of service.

**Enter your RTO in the Partner Response column of the self-assessment worksheet.**

#### RES-004 - Resilience Testing

Test resilience to ensure that your established targets are met, both periodically (minimum every 12 months) and after major updates. The resilience test should include at minimum Availability Zone (AZ) impairments and any other failure modes relevant to your architecture such as: accidental data loss, instance impairments, or region impairments. At least one resilience test that meets established requirements must be completed prior to FTR approval.

You can use [AWS Resilience Hub](https://aws.amazon.com/resilience-hub/) to verify your workloads to see if it meets its resilience target. AWS Resilience Hub works with [AWS Fault Injection Service (AWS FIS)](https://aws.amazon.com/fis/), to provide fault-injection experiments of real-world failures to validate the application recovers within the resilience targets you defined. AWS Resilience Hub also provides API operations for you to integrate its resilience assessment and testing into your CI/CD pipelines for ongoing resilience validation. Including resilience validation in CI/CD pipelines helps make sure that changes to the workload's underlying infrastructure don't compromise resilience.

**Enter the date of the last resilience test in the Partner Response column of the self-assessment worksheet.**

#### RES-005 - Communicate customer responsibilities for resilience.

Clearly define your customers' responsibility for backup, recovery, and availability. At a minimum, your product documentation or customer agreements should cover the following:

- Responsibility the customer has for backing up the data stored in your solution.
- Instructions for backing up data or configuring optional features in your product for data protection, if applicable.
- Options customers have for configuring the availability of your product.

#### RES-006 - Architect your product to meet availability targets and uptime service level agreements (SLAs).

If you publish or privately agree to availability targets or uptime SLAs, ensure that your architecture and operational processes are designed to support them. Additionally, provide clear guidance to customers on any configuration required to achieve the targets or SLAs. Refer to [Resilience strategy for AWS ISV Partners](https://apg-library.amazonaws.com/content/936ec6d4-23fb-4c5c-9d13-60536c78251d) to review your resilience strategy and make any required changes.

#### RES-007 - Define a customer communication plan for outages.

Establish a plan for communicating information about system outages to your customers both during and after incidents. Your communication should not include any data that was provided by AWS under a non-disclosure agreement (NDA).

#### S3-001 - Review all Amazon S3 buckets to determine appropriate access levels.

You must ensure that buckets that require public access have been reviewed to determine if public read or write access is needed and if appropriate controls are in place to control public access. When assigning access permissions, follow the [principle of least privilege](https://docs.aws.amazon.com/IAM/latest/UserGuide/best-practices.html#grant-least-privilege), an AWS best practice. For more information, refer to [overview of managing access](https://docs.aws.amazon.com/AmazonS3/latest/dev/access-control-overview.html).

#### CAA-001 - Use cross-account roles to access customer AWS accounts.

[Cross-account roles](https://aws.amazon.com/blogs/apn/securely-accessing-customer-aws-accounts-with-cross-account-iam-roles/) reduce the amount of sensitive information AWS Partners need to store for their customers.

#### CAA-007 - Provide guidance or an automated setup mechanism (for example, an AWS CloudFormation template) for creating cross-account roles with the minimum required privileges.

The policy created for cross-account access in customer accounts must follow the [principle of least privilege](https://docs.aws.amazon.com/IAM/latest/UserGuide/best-practices.html#grant-least-privilege). The AWS Partner must provide a role-policy document or an automated setup mechanism (for example, an AWS CloudFormation template) for the customers to use to ensure that the roles are created with minimum required privileges. For more information, refer to the [AWS Partner Network (APN) blog posts](https://aws.amazon.com/blogs/apn/tag/cross-account-roles/).

#### CAA-002 - Use an external ID or dedicated issuer URL with cross-account roles to access customer accounts.

Depending on if you're using the [AssumeRole API](https://docs.aws.amazon.com/STS/latest/APIReference/API_AssumeRole.html) or [AssumeRoleWithWebIdentity API](https://docs.aws.amazon.com/STS/latest/APIReference/API_AssumeRoleWithWebIdentity.html), an external ID (AssumeRole) or dedicated issuer URL (AssumeRoleWithWebIdentity) must be used to access customer accounts. It allows the user that is assuming the role to assert the circumstances in which they are operating. It also provides a way for the account owner to permit the role to be assumed only under specific circumstances. The primary function of the external ID and dedicated issuer URL is to address and prevent the [confused deputy](https://aws.amazon.com/blogs/security/how-to-use-external-id-when-granting-access-to-your-aws-resources) problem. To implement the dedicated issuer URL for AssumeRoleWithWebIdentity API, refer to [this documentation](https://docs.aws.amazon.com/IAM/latest/UserGuide/id_roles_providers_create_oidc.html).

#### CAA-004 - Use a value you generate (not something provided by the customer) for the external ID or dedicated issuer URL.

When configuring cross-account access using IAM roles, you must use a value you generate for the external ID or dedicated issuer URL, instead of one provided by the customer, to ensure the integrity of the cross-account role configuration. A partner-generated external ID or dedicated issuer URL ensures that malicious parties cannot impersonate a customer's configuration and enforces uniqueness and format consistency across all customers. If you are not generating an external ID or dedicated issuer URL today we recommend implementing a process that generates a random unique value (such as a [Universally Unique Identifier](https://en.wikipedia.org/wiki/Universally_unique_identifier)) for the external ID or dedicated issuer URL that a customer uses to set up a cross-account role.

#### CAA-005 - Ensure that all external IDs or dedicated issuer URLs are unique.

The external IDs or dedicated issuer URLs used must be unique across all customers. Re-using external IDs or dedicated issuer URLs for different customers does not solve the confused deputy problem and runs the risk of customer A being able to view data of customer B by using the role ARN and the external ID or dedicated issuer URL of customer B. To resolve this, we recommend implementing a process that ensures a random unique value, such as a [Universally Unique Identifier](https://en.wikipedia.org/wiki/Universally_unique_identifier), is generated for the external ID or dedicated issuer URL that a customer would use to setup a cross account role.

#### CAA-006 - Provide read-only access to external ID or dedicated issuer URL to customers.

Customers must not be able to set or influence external IDs or dedicated issuer URLs. When the external ID or dedicated issuer URL is editable, it is possible for one customer to impersonate the configuration of another. For example, when the external ID or dedicated issuer URL is editable, customer A can create a cross account role setup using customer B's role ARN and external ID or dedicated issuer URL, granting customer A access to customer B's data. Remediation of this item involves making the external ID or dedicated issuer URL a view-only field, ensuring that the external ID or dedicated issuer URL cannot be changed to impersonate the setup of another customer.

#### CAA-003 - Deprecate any historical use of customer-provided IAM credentials.

If your application provides legacy support for the use of static IAM credentials for cross-account access, the application's user interface and customer documentation must make it clear that this method is deprecated. Existing customers should be encouraged to switch to [cross-account role based-access](https://aws.amazon.com/blogs/apn/securely-accessing-customer-aws-accounts-with-cross-account-iam-roles/), and collection of credentials should be disabled for new customers.

#### SDAT-001 - Identify sensitive data (for example, Personally Identifiable Information (PII) and Protected Health Information (PHI)).

Data classification enables you to determine which data needs to be protected and how. Based on the workload and the data it processes, identify the data that is not common public knowledge.

#### SDAT-002 - Encrypt all sensitive data at rest.

Encryption maintains the confidentiality of sensitive data even when it gets stolen or the network through which it is transmitted becomes compromised.

#### SDAT-003 - Only use protocols with encryption when transmitting sensitive data outside of your VPC.

Encryption maintains data confidentiality even when the network through which it is transmitted becomes compromised.

#### RCVP-001 - Establish a process to ensure that all required compliance standards are met.

If you advertise that your product meets specific compliance standards, you must have an internal process for ensuring compliance. Examples of compliance standards include Payment Card Industry Data Security Standard (PCI DSS) PCI DSS, Federal Risk and Authorization Management Program (FedRAMP)FedRAMP, and U.S. Health Insurance Portability and Accountability Act (HIPAA)HIPAA. Applicable compliance standards are determined by various factors, such as what types of data the solution stores or transmits and which geographic regions the solution supports.

## Resources

- [Changes between previous and current versions](https://apn-checklists.s3.amazonaws.com/changelog/Validation_Checklist_Change_Log.pdf) — Change Log
- [FTR Guide](https://partnercentral.awspartner.com/ContentFolderPartner?id=0690h00000BGRJhAAP) — FTR Guide
