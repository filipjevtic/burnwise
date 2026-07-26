{{- define "burnwise.name" -}}
{{- default .Chart.Name .Values.nameOverride | trunc 63 | trimSuffix "-" -}}
{{- end -}}

{{- define "burnwise.fullname" -}}
{{- if .Values.fullnameOverride -}}
{{- .Values.fullnameOverride | trunc 63 | trimSuffix "-" -}}
{{- else -}}
{{- printf "%s-%s" .Release.Name (include "burnwise.name" .) | trunc 63 | trimSuffix "-" -}}
{{- end -}}
{{- end -}}

{{- define "burnwise.labels" -}}
app.kubernetes.io/name: {{ include "burnwise.name" . }}
app.kubernetes.io/instance: {{ .Release.Name }}
app.kubernetes.io/managed-by: {{ .Release.Service }}
helm.sh/chart: {{ printf "%s-%s" .Chart.Name .Chart.Version }}
{{- end -}}

{{- define "burnwise.image.tag" -}}
{{- .Values.image.tag | default .Chart.AppVersion -}}
{{- end -}}

{{- /* Image ref for a component: server|web|proxy|migrate */ -}}
{{- define "burnwise.image" -}}
{{- $root := index . 0 -}}
{{- $svc := index . 1 -}}
{{- printf "%s/%s/%s:%s" $root.Values.image.registry $root.Values.image.repository $svc (include "burnwise.image.tag" $root) -}}
{{- end -}}

{{- /* Name of the Secret holding sensitive env (existing or chart-managed). */ -}}
{{- define "burnwise.secretName" -}}
{{- if .Values.secrets.existingSecret -}}
{{- .Values.secrets.existingSecret -}}
{{- else -}}
{{- printf "%s-secrets" (include "burnwise.fullname" .) -}}
{{- end -}}
{{- end -}}

{{- define "burnwise.serverUrl" -}}
{{- printf "http://%s-server:%d" (include "burnwise.fullname" .) (int .Values.server.service.port) -}}
{{- end -}}

{{- /* Hardened container securityContext. Arg: numeric uid (node=1000, nginx=101). */ -}}
{{- define "burnwise.containerSecurityContext" -}}
runAsNonRoot: true
runAsUser: {{ . }}
allowPrivilegeEscalation: false
readOnlyRootFilesystem: true
capabilities:
  drop: [ALL]
seccompProfile:
  type: RuntimeDefault
{{- end -}}

{{- /* Pod securityContext. Arg: numeric fsGroup so emptyDir volumes are writable. */ -}}
{{- define "burnwise.podSecurityContext" -}}
runAsNonRoot: true
fsGroup: {{ . }}
seccompProfile:
  type: RuntimeDefault
{{- end -}}
