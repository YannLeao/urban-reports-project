# Fixtures de vídeo sintéticas

Sem conteúdo pessoal, tags pessoais ou credenciais. Geradas com FFmpeg 8.1.3
(libopenh264 + AAC), sem downloads de mídia. Os nomes `reject-*` identificam
arquivos decodificáveis fora do contrato; os testes devem recusá-los.

Na raiz, exemplos de regeneração (não sobrescrever sem revisar os testes):

```bash
ffmpeg -nostdin -f lavfi -i color=c=blue:s=320x240:r=30 \
  -f lavfi -i sine=frequency=440:sample_rate=48000 -t 1 \
  -c:v libopenh264 -pix_fmt yuv420p -c:a aac h264-aac.mp4
ffmpeg -nostdin -f lavfi -i color=c=blue:s=240x320:r=30 \
  -t 1 -c:v libopenh264 -pix_fmt yuv420p -an h264-portrait.mp4
ffmpeg -nostdin -f lavfi -i color=c=blue:s=320x240:r=30 \
  -t 30 -c:v libopenh264 -pix_fmt yuv420p -an h264-30s.mp4
```

Recusas: 31 fps (r=31, t=1), duração 30,1 s (r=30, t=30.1),
resolução 1280×736 (r=1, t=1) e AAC 96 kHz (sample_rate=96000 e -ar 96000).
Os restantes parâmetros correspondem aos exemplos acima. Os testes também
mutam cópias em memória para MOV, criptografia, referência externa e truncamento.
Nenhum arquivo aceito é transformado pela aplicação.

`h264-rotated` é cópia sintética H.264/AAC com metadado rotate=90, criada com
`ffmpeg -i h264-aac.mp4 -c copy -metadata:s:v:0 rotate=90 h264-rotated.mp4`.
