# =============================================================================
# Valet Browser Worker — Outputs
# =============================================================================

output "instance_public_ips" {
  description = "Elastic IP addresses assigned to each worker instance"
  value       = aws_eip.valet_worker[*].public_ip
}

output "instance_ids" {
  description = "EC2 instance IDs for each worker instance"
  value       = aws_instance.valet_worker[*].id
}

output "instance_private_ips" {
  description = "Private IP addresses of each worker instance (for internal VPC communication)"
  value       = aws_instance.valet_worker[*].private_ip
}

output "ssh_commands" {
  description = "SSH connection strings for each worker instance"
  value = [
    for i, eip in aws_eip.valet_worker :
    "ssh -i ~/.ssh/${var.key_name}.pem ubuntu@${eip.public_ip}"
  ]
}

output "novnc_urls" {
  description = "noVNC web viewer URLs for visual debugging of browser sessions"
  value = [
    for eip in aws_eip.valet_worker :
    "http://${eip.public_ip}:6080"
  ]
}

output "health_check_urls" {
  description = "Health check endpoint URLs for monitoring"
  value = [
    for eip in aws_eip.valet_worker :
    "http://${eip.public_ip}:8080/health"
  ]
}
