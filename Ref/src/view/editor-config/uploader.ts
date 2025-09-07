/* Copyright 2021, Milkdown by Mirone.*/
import { upload, uploadConfig } from '@milkdown/kit/plugin/upload';
import type { Node } from '@milkdown/kit/prose/model';
import type { Editor } from '@milkdown/kit/core';
import type { ClientMessage } from '../utils/client-message';

async function compressBase64Img(base64: string, quality = 0.7): Promise<string> {
    return new Promise((resolve) => {
        const img = new Image();
        img.onload = () => {
            const canvas = document.createElement("canvas");
            canvas.width = img.width;
            canvas.height = img.height;

            const ctx = canvas.getContext("2d");
            if (ctx) {
                ctx.drawImage(img, 0, 0, img.width, img.height);

                // JPEG compression
                const compressed = canvas.toDataURL("image/jpeg", quality);

                // Or WebP (smaller but not supported everywhere):
                // const compressed = canvas.toDataURL("image/webp", quality);

                resolve(compressed);
            }
        };
        img.src = "data:image/png;base64," + base64; // load original
    });
}


export const useUploader = (editor: Editor, message: ClientMessage) => {
    editor
        .config((ctx) => {
            ctx.update(uploadConfig.key, (prev) => ({
                ...prev,
                uploader: async (files, schema) => {
                    const images: File[] = [];
                    const readImageAsBase64 = (file: File): Promise<{ alt: string; src: string }> => {
                        return new Promise((resolve) => {
                            const reader = new FileReader();
                            reader.addEventListener(
                                'load',
                                () => {
                                    resolve({
                                        alt: file.name,
                                        src: reader.result?.toString().split(',')[1] as string,
                                    });
                                },
                                false,
                            );
                            reader.readAsDataURL(file);
                        });
                    };

                    for (let i = 0; i < files.length; i++) {
                        const file = files.item(i);
                        if (!file) {
                            continue;
                        }

                        // You can handle whatever the file type you want, we handle image here.
                        if (!file.type.includes('image')) {
                            continue;
                        }

                        images.push(file);
                    }

                    const nodes: Node[] = await Promise.all(
                        images.map(async (image) => {
                            const { alt, src: base64 } = await readImageAsBase64(image);
                            // Just use base64 as image
                            // const compressedSrc = await compressBase64Img(base64, 0.6);
                            const src = "data:image/png;base64," + base64
                            return schema.nodes.image.createAndFill({
                                src: src, // the target image
                                alt,
                            }) as Node;
                        }),
                    );

                    return nodes;
                },
            }));
        })
        .use(upload);
};
