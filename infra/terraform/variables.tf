# =============================================================================
# Valet Browser Worker — Input Variables
# =============================================================================

variable "aws_region" {
  description = "AWS region to deploy worker instances into"
  type        = string
  default     = "us-east-1"
}

variable "instance_type" {
  description = "EC2 instance type. t3.xlarge provides 4 vCPU / 16 GB RAM, suitable for running AdsPower with multiple browser profiles"
  type        = string
  default     = "t3.xlarge"
}

variable "instance_count" {
  description = "Number of worker instances to provision. Scale up for higher concurrency"
  type        = number
  default     = 1

  validation {
    condition     = var.instance_count >= 1 && var.instance_count <= 10
    error_message = "instance_count must be between 1 and 10."
  }
}

variable "allowed_cidr" {
  description = "CIDR blocks allowed to access SSH, noVNC, and health-check ports. Restrict this to your IP in production (e.g., [\"203.0.113.0/32\"])"
  type        = list(string)
  default     = ["0.0.0.0/0"]
}

variable "environment" {
  description = "Deployment environment label used in resource names and tags"
  type        = string
  default     = "staging"

  validation {
    condition     = contains(["staging", "production"], var.environment)
    error_message = "environment must be either 'staging' or 'production'."
  }
}

variable "key_name" {
  description = "Name of an existing AWS EC2 key pair for SSH access. Create one in the AWS Console under EC2 > Key Pairs"
  type        = string
  # No default — must be provided by the operator
}

variable "volume_size" {
  description = "Root EBS volume size in GB. 80 GB accommodates AdsPower profiles, browser cache, and application data"
  type        = number
  default     = 80

  validation {
    condition     = var.volume_size >= 30 && var.volume_size <= 500
    error_message = "volume_size must be between 30 and 500 GB."
  }
}
