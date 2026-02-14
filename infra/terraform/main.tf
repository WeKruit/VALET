# =============================================================================
# Valet Browser Worker — EC2 Infrastructure
# =============================================================================
# Provisions Ubuntu EC2 instances with Xvfb + noVNC for headless browser
# automation. AdsPower and the Valet worker process run locally on each
# instance; only the VNC viewer and health-check ports are exposed.
# =============================================================================

terraform {
  required_version = ">= 1.5"

  required_providers {
    aws = {
      source  = "hashicorp/aws"
      version = "~> 5.0"
    }
  }
}

# -----------------------------------------------------------------------------
# Provider
# -----------------------------------------------------------------------------
provider "aws" {
  region = var.aws_region
}

# -----------------------------------------------------------------------------
# Data Sources
# -----------------------------------------------------------------------------

# Auto-discover the latest Ubuntu 22.04 LTS AMI from Canonical
data "aws_ami" "ubuntu" {
  most_recent = true
  owners      = ["099720109477"] # Canonical

  filter {
    name   = "name"
    values = ["ubuntu/images/hvm-ssd/ubuntu-jammy-22.04-amd64-server-*"]
  }

  filter {
    name   = "virtualization-type"
    values = ["hvm"]
  }

  filter {
    name   = "architecture"
    values = ["x86_64"]
  }
}

# Use the default VPC — no custom networking required
data "aws_vpc" "default" {
  default = true
}

# Grab all subnets in the default VPC so instances spread across AZs
data "aws_subnets" "default" {
  filter {
    name   = "vpc-id"
    values = [data.aws_vpc.default.id]
  }
}

# -----------------------------------------------------------------------------
# Security Group
# -----------------------------------------------------------------------------
# Only SSH, noVNC, and health-check ports are exposed.
# AdsPower (50325) and CDP debug ports remain on localhost.
resource "aws_security_group" "valet_worker" {
  name        = "valet-worker-${var.environment}"
  description = "Security group for Valet browser worker instances"
  vpc_id      = data.aws_vpc.default.id

  # SSH access — restrict allowed_cidr in production
  ingress {
    description = "SSH"
    from_port   = 22
    to_port     = 22
    protocol    = "tcp"
    cidr_blocks = var.allowed_cidr
  }

  # noVNC web viewer — for visual debugging of browser sessions
  ingress {
    description = "noVNC web viewer"
    from_port   = 6080
    to_port     = 6080
    protocol    = "tcp"
    cidr_blocks = var.allowed_cidr
  }

  # Health-check API endpoint (optional, used by monitoring)
  ingress {
    description = "Health check API"
    from_port   = 8080
    to_port     = 8080
    protocol    = "tcp"
    cidr_blocks = var.allowed_cidr
  }

  # All outbound traffic allowed — instance needs to reach Hatchet,
  # Supabase, Upstash, and external job-application sites
  egress {
    description = "All outbound"
    from_port   = 0
    to_port     = 0
    protocol    = "-1"
    cidr_blocks = ["0.0.0.0/0"]
  }

  tags = {
    Name        = "valet-worker-sg-${var.environment}"
    Project     = "valet"
    Environment = var.environment
  }
}

# -----------------------------------------------------------------------------
# EC2 Instances
# -----------------------------------------------------------------------------
# Each instance runs Xvfb + Fluxbox + x11vnc + noVNC + AdsPower + Valet worker.
# cloud-init handles all first-boot provisioning.
resource "aws_instance" "valet_worker" {
  count = var.instance_count

  ami                    = data.aws_ami.ubuntu.id
  instance_type          = var.instance_type
  key_name               = var.key_name
  vpc_security_group_ids = [aws_security_group.valet_worker.id]

  # Distribute instances across available subnets for AZ spread
  subnet_id = element(data.aws_subnets.default.ids, count.index % length(data.aws_subnets.default.ids))

  # 80 GB gp3 root volume — enough for AdsPower profiles, browser cache,
  # and Node.js dependencies
  root_block_device {
    volume_type           = "gp3"
    volume_size           = var.volume_size
    delete_on_termination = true
    encrypted             = true
  }

  # cloud-init runs on first boot to install packages and configure services
  user_data = file("${path.module}/cloud-init.yaml")

  # Don't recreate the instance if only user_data changes
  lifecycle {
    ignore_changes = [user_data]
  }

  tags = {
    Name        = "valet-worker-${count.index}"
    Project     = "valet"
    Environment = var.environment
  }
}

# -----------------------------------------------------------------------------
# Elastic IPs
# -----------------------------------------------------------------------------
# One EIP per instance for stable public addressing. Useful for SSH access
# and allowlisting on external services.
resource "aws_eip" "valet_worker" {
  count    = var.instance_count
  instance = aws_instance.valet_worker[count.index].id
  domain   = "vpc"

  tags = {
    Name        = "valet-worker-eip-${count.index}"
    Project     = "valet"
    Environment = var.environment
  }
}
