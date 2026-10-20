package com.project.software.urbanreports.storage.application;

import java.io.InputStream;

/** Streaming handle: abort must release transport without draining unconsumed bytes. */
public interface MediaObject extends AutoCloseable {
    InputStream input();
    void abort();
    @Override void close();
}
