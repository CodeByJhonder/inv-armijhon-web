(() => {
    const bucket = 'chat-attachments';
    const maxFiles = 5;
    const maxFileSize = 10 * 1024 * 1024;

    function formatFileSize(bytes) {
        if (bytes < 1024 * 1024) return `${Math.max(1, Math.round(bytes / 1024))} KB`;
        return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
    }

    function validateFiles(currentFiles, newFiles) {
        const combined = [...currentFiles, ...newFiles];
        if (combined.length > maxFiles) return `Puedes adjuntar hasta ${maxFiles} archivos por mensaje.`;
        for (const file of newFiles) {
            const isImage = file.type.startsWith('image/');
            const isPdf = file.type === 'application/pdf' && /\.pdf$/i.test(file.name);
            if (!isImage && !isPdf) return 'Solo puedes adjuntar archivos de imagen o documentos PDF.';
            if (!file.size || file.size > maxFileSize) return 'Cada archivo debe pesar como máximo 10 MB.';
        }
        return '';
    }

    function renderSelectedFiles(container, files, removeFile) {
        container.replaceChildren();
        if (!files.length) {
            container.classList.add('hidden');
            return;
        }
        container.classList.remove('hidden');
        files.forEach((file, index) => {
            const item = document.createElement('div');
            item.className = 'flex min-w-0 items-center gap-2 rounded-lg border border-slate-700 bg-slate-950 px-2.5 py-2 text-[10px] text-slate-300';
            const icon = document.createElement('i');
            icon.className = `fa-solid ${file.type === 'application/pdf' ? 'fa-file-pdf text-red-300' : 'fa-file-image text-indigo-300'}`;
            const label = document.createElement('span');
            label.className = 'min-w-0 flex-1 truncate';
            label.textContent = `${file.name} · ${formatFileSize(file.size)}`;
            const remove = document.createElement('button');
            remove.type = 'button';
            remove.className = 'shrink-0 px-1 text-slate-400 hover:text-red-300';
            remove.setAttribute('aria-label', `Quitar ${file.name}`);
            remove.innerHTML = '<i class="fa-solid fa-xmark"></i>';
            remove.addEventListener('click', () => removeFile(index));
            item.append(icon, label, remove);
            container.append(item);
        });
    }

    async function invoke(client, body) {
        const { data, error } = await client.functions.invoke('customer-chat', { body });
        if (error) {
            let message = error.message || 'No se pudo procesar el archivo adjunto.';
            if (error.context && typeof error.context.clone === 'function') {
                try {
                    const responseBody = await error.context.clone().json();
                    if (typeof responseBody?.error === 'string') message = responseBody.error;
                } catch (parseError) {
                    console.warn('No se pudo interpretar el error de archivos del chat:', parseError);
                }
            }
            throw new Error(message);
        }
        if (data?.error) throw new Error(data.error);
        return data;
    }

    async function uploadFiles({ client, audience, conversationId, sessionToken, files, onProgress }) {
        const uploaded = [];
        const session = {
            audience,
            conversationId,
            ...(audience === 'customer' ? { sessionToken } : {})
        };
        try {
            for (const [index, file] of files.entries()) {
                onProgress?.(`Subiendo archivo ${index + 1} de ${files.length}...`);
                const signedUpload = await invoke(client, {
                    action: 'attachment_upload_url',
                    ...session,
                    name: file.name,
                    mimeType: file.type,
                    size: file.size
                });
                const { error } = await client.storage
                    .from(bucket)
                    .uploadToSignedUrl(signedUpload.path, signedUpload.token, file, {
                        contentType: file.type,
                        upsert: false
                    });
                if (error) throw error;
                uploaded.push({
                    path: signedUpload.path,
                    name: file.name,
                    mimeType: file.type,
                    size: file.size
                });
            }
            return uploaded;
        } catch (error) {
            if (uploaded.length) {
                try {
                    await invoke(client, {
                        action: 'attachment_cleanup',
                        ...session,
                        paths: uploaded.map(attachment => attachment.path)
                    });
                } catch (cleanupError) {
                    console.error('No se pudieron limpiar algunos archivos incompletos:', cleanupError);
                }
            }
            throw error;
        }
    }

    async function cleanupFiles({ client, audience, conversationId, sessionToken, attachments }) {
        if (!attachments.length) return;
        await invoke(client, {
            action: 'attachment_cleanup',
            audience,
            conversationId,
            ...(audience === 'customer' ? { sessionToken } : {}),
            paths: attachments.map(attachment => attachment.path)
        });
    }

    function renderAttachments(container, attachments) {
        if (!Array.isArray(attachments) || !attachments.length) return;
        const list = document.createElement('div');
        list.className = 'mt-2 grid gap-2';
        attachments.forEach(attachment => {
            if (!attachment?.url || !attachment.name) return;
            if (attachment.mimeType?.startsWith('image/') && !attachment.download) {
                const link = document.createElement('a');
                link.href = attachment.url;
                link.target = '_blank';
                link.rel = 'noopener noreferrer';
                link.className = 'block max-w-full overflow-hidden rounded-xl';
                link.setAttribute('aria-label', `Abrir imagen ${attachment.name}`);
                const image = document.createElement('img');
                image.src = attachment.url;
                image.alt = attachment.name;
                image.loading = 'lazy';
                image.className = 'max-h-56 max-w-full rounded-xl object-contain';
                link.append(image);
                list.append(link);
            } else {
                const link = document.createElement('a');
                link.href = attachment.url;
                link.target = '_blank';
                link.rel = 'noopener noreferrer';
                link.className = 'flex items-center gap-3 rounded-xl border border-slate-500/20 bg-slate-950/30 px-3 py-2 text-current transition hover:bg-slate-950/50';
                link.download = attachment.download ? attachment.name : '';
                const icon = document.createElement('i');
                icon.className = `fa-solid ${attachment.mimeType === 'application/pdf' ? 'fa-file-pdf text-red-300' : 'fa-file-arrow-down text-slate-300'}`;
                const details = document.createElement('span');
                details.className = 'min-w-0';
                const name = document.createElement('span');
                name.className = 'block max-w-56 truncate text-[11px] font-bold';
                name.textContent = attachment.name;
                const size = document.createElement('span');
                size.className = 'block text-[9px] opacity-70';
                size.textContent = formatFileSize(attachment.size);
                details.append(name, size);
                link.append(icon, details);
                list.append(link);
            }
        });
        if (list.childElementCount) container.append(list);
    }

    window.ChatAttachments = { maxFiles, formatFileSize, validateFiles, renderSelectedFiles, uploadFiles, cleanupFiles, renderAttachments };
})();
