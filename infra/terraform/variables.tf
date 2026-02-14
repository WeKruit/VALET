# =============================================================================
# Valet Browser Worker — Input Variables
# =============================================================================

variable "aws_region" {
  description = "AWS region to deploy worker instances into"
  type        = string
  default     = "us-east-1"
}

variable "instance_type" {
  description = "EC2 instance type. t3.large (2 vCPU / 8 GB) — minimum for AdsPower Electron + browser profiles"
  type        = string
  default     = "t3.large"
}

variable "instance_count" {
  description = "Number of worker instances to provision. Scale up for higher concurrency"
  type        = number
  default     = 1

  validation {
    condition     = var.instance_count >= 0 && var.instance_count <= 10
    error_message = "instance_count must be between 0 and 10."
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
  description = "AWS SSH key pair name — all sandboxes use the same key. Create in AWS Console under EC2 > Key Pairs"
  type        = string
  default     = "valet-worker"
}

variable "volume_size" {
  description = "Root EBS volume size in GB. 40 GB is fine for dev; scale up for production with many profiles"
  type        = number
  default     = 40

  validation {
    condition     = var.volume_size >= 30 && var.volume_size <= 500
    error_message = "volume_size must be between 30 and 500 GB."
  }
}
