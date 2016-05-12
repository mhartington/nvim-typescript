
# from .base import Base

# class Source(Base):
#     def __init__(self, vim):
#         Base.__init__(self, vim)

#         self.name = 'typescript'
#         self.mark = '[TS]'
#         self.filetypes = ['typescript']
#         self.input_pattern = '\.'
#         self.is_bytepos = True

#     def get_complete_position(self, context):
#         return self.vim.call('tsuquyomi#complete', 1, 0)

#     def gather_candidates(self, context):
#         return self.vim.call('tsuquyomi#complete', 0, 0)

# pylint: disable=E0401,C0111,R0903

import os
import re
import json
import sys
import platform
import subprocess
import time
import fcntl
import locale

from deoplete.sources.base import Base
from logging import getLogger
import json
import logging
import subprocess

from threading import Lock, Event, Thread

PY2 = int(sys.version[0]) == 2

if PY2:
    import urllib2 as request
    from urllib2 import HTTPError
else:  # Py3
    from urllib import request
    from urllib.error import HTTPError

opener = request.build_opener(request.ProxyHandler({}))
current = __file__

logger = getLogger(__name__)
windows = platform.system() == "Windows"
_tsserver_handle = subprocess.Popen("tsserver",
        stdout = subprocess.PIPE,
        stdin = subprocess.PIPE,
        stderr = subprocess.STDOUT,
        universal_newlines = True,
        bufsize = 1)

class ResponseEvent( Event ):
  "Used for blocking the SendRequest method until the response is available"

  def __init__( self ):
    super( ResponseEvent, self ).__init__()
    self._response = None

  def SetResponse( self, response ):
    logger.debug("SetResponse: {0}".format(response))
    self._response = response
    self.set()

  def GetResponse( self ):
    logger.debug("ResponseEvent: GetResponse")
    if not self.is_set():
        logger.debug("ResponseEvent: GetResponse: waiting")
        self.wait()
    logger.debug("ResponseEvent: GetResponse: returning response")
    return self._response

BINARY_NOT_FOUND_MESSAGE = ( 'tsserver not found. '
                             'TypeScript 1.5 or higher is required' )

class TSServer:
  """
  Wrapper for for TSServer which is bundled with TypeScript 1.5

  See the protocol here:
  https://github.com/Microsoft/TypeScript/blob/2cb0dfd99dc2896958b75e44303d8a7a32e5dc33/src/server/protocol.d.ts
  """

  def __init__(self):
    logger.debug("TSServer: __init__")

    # Used to prevent threads from concurrently reading and writing to
    # the tsserver process' stdout and stdin
    self._lock = Lock()

    binarypath = 'tsserver'
    if not binarypath:
        logger.error( BINARY_NOT_FOUND_MESSAGE )
        raise RuntimeError( BINARY_NOT_FOUND_MESSAGE )


    # Each request sent to tsserver must have a sequence id.
    # Responses contain the id sent in the corresponding request.
    self._sequenceid = 0

    # TSServer ignores the fact that newlines are two characters on Windows
    # (\r\n) instead of one on other platforms (\n), so we use the
    # universal_newlines option to convert those newlines to \n. See the issue
    # https://github.com/Microsoft/TypeScript/issues/3403
    # TODO: remove this option when the issue is fixed.
    # We also need to redirect the error stream to the output one on Windows.

    # When a request message is sent and requires a response, a ResponseEvent
    # is placed in this dictionary and
    self._response_events = {}
    logger.debug("TSServer: __init__: start _MessageReaderLoop")
    # self._thread = Thread(target = self._MessageReaderLoop)
    # self._thread.daemon = True
    # self._thread.start()

  def SendRequest( self, command, arguments = None, wait_for_response = True ):
    logger.debug("SendRequest")
    """Send a request message to TSServer."""

    seq = self._NextSequenceId()

    request = {
      'seq':     seq,
      'type':    'request',
      'command': command
    }
    if arguments:
      request[ 'arguments' ] = arguments
    logger.debug("SendRequest: request: {0}".format(request))

    # If the request expects a response, use an Event to block
    # until the response is available
    # if wait_for_response:
    #     logger.debug("SendRequest: wait_for_response = True")
    #     event = ResponseEvent()
    #     self._response_events[seq] = event
    #     self._WriteMessage(request)
    #     logger.debug("SendRequest: event: {0}".format(event))
    #     return event.GetResponse()

    logger.debug("SendRequest: wait_for_response = False")
    self._WriteMessage(request)

  def _NextSequenceId( self ):
    seq = self._sequenceid
    self._sequenceid += 1
    return seq

  def _WriteMessage( self, message ):
    logger.debug("_WriteMessage")
    with self._lock:
      _tsserver_handle.stdin.write(json.dumps(message))
      _tsserver_handle.stdin.write("\n")
      logger.debug("_WriteMessage: written")

  # def _MessageReaderLoop( self ):
  #   logger.debug("_MessageReaderLoop")
  #   while True:
  #       logger.debug("_MessageReaderLoop looping")
  #       try:
  #           message = self._ReadMessage()
  #           logger.debug("_MessageReaderLoop: {0}".format(message["type"]))
  #           if message[ 'type' ] == 'event':
  #               logger.debug("_MessageReaderLoop: _HandleEvent")
  #               self._HandleEvent( message )
  #           if message[ 'type' ] == 'response':
  #               logger.debug("_MessageReaderLoop: _HandleResponse")
  #               self._HandleResponse( message )
  #       except Exception as e:
  #           logger.error( e )

  # def _ReadMessage( self ):
  #   """Read a response message from TSServer."""
  #   logger.debug("_ReadMessage")

  #   # The headers are pretty similar to HTTP.
  #   # At the time of writing, 'Content-Length' is the only supplied header.
  #   headers = {}
  #   logger.debug("_ReadMessage: _tsserver_handle: {0}".format(_tsserver_handle))
  #   while True:
  #       headerline = _tsserver_handle.stdout.readline()
  #       logger.debug("_ReadMessage: headerline: {0}".format(headerline))
  #       if not len(headerline):
  #           logger.debug("_ReadMessage: headerline is None")
  #           break
  #       key, value = headerline.split( ':', 1 )
  #       headers[ key.strip() ] = value.strip()

  #   logger.debug("_ReadMessage: headers {)}".format(headers))
  #   # The response message is a JSON object which comes back on one line.
  #   # Since this might change in the future, we use the 'Content-Length'
  #   # header.
  #   if 'Content-Length' not in headers:
  #     raise RuntimeError( "Missing 'Content-Length' header" )
  #   contentlength = int( headers[ 'Content-Length' ] )
  #   message = json.loads( _tsserver_handle.stdout.read( contentlength ) )

  #   logger.debug("_ReadMessage: message: {0}".format(message))
  #   return message

  def _HandleResponse( self, response ):
    logger.debug("_HandleResponse")
    seq = response[ 'request_seq' ]
    if seq in self._response_events:
      self._response_events[ seq ].SetResponse( response )
      del self._response_events[ seq ]
    else:
      logger.debug( 'Recieved unhandled response (sequence {0})'.format( seq ) )

  def _HandleEvent( self, event ):
    logger.debug("_HandleResponse")
    """Handle event message from TSServer."""

    # We ignore events for now since we don't have a use for them.
    eventname = event[ 'event' ]
    logger.debug( 'Recieved {0} event from tsserver'.format( eventname ) )

class Source(Base):
    "Main completer class"
    def __init__(self, vim):
        Base.__init__(self, vim)

        self.debug_enabled = True
        self.name = 'typescript'
        self.mark = '[ts]'
        self.filetypes = ['typescript']
        self.input_pattern = '\.'
        self.is_bytepos = True
        self.tsserver = None

    def relative_file(self):
        return self.vim.eval("expand('%:p')")

    def get_complete_position(self, context):
        m = re.search(r'\w*$', context['input'])
        return m.start() if m else -1

    def gather_candidates(self, context):
        if not self.tsserver:
            self.tsserver = TSServer()

        self.debug("gather_candidates")

        self.debug("gather_candidates: open file")
        self.tsserver.SendRequest('open', {
            'file': self.relative_file()
        }, wait_for_response = False);

        self.debug("gather_candidates: prepare completions request")
        line = context['position'][1]
        col = context['complete_position']

        completionsRequestBody = {
            'file':   self.relative_file(),
            'line':   line,
            'offset': col,
            'prefix': context["input"]
        }
        self.tsserver.SendRequest('completions', completionsRequestBody, wait_for_response = True)

        self.debug("gather_candidates: completions request: {0}".format(completionsRequestBody))

        headers = {}
        linecount = 0
        while True:
            headerline = _tsserver_handle.stdout.readline().strip()
            linecount += 1;
            logger.debug("_ReadMessage: headerline: {0}".format(headerline))
            if len(headerline):
                key, value = headerline.split( ':', 2 )
                headers[ key.strip() ] = value.strip()
                logger.debug(headers)
                break

        logger.debug("_ReadMessage: headers {0}".format(headers))
        # The response message is a JSON object which comes back on one line.
        # Since this might change in the future, we use the 'Content-Length'
        # header.
        if 'Content-Length' not in headers:
            raise RuntimeError( "Missing 'Content-Length' header" )
        contentlength = int( headers[ 'Content-Length' ] )
        data = json.loads( _tsserver_handle.stdout.read( contentlength ) )

        # logger.debug("_ReadMessage: message: {0}".format(data))

        completions = []
        if data is not None:

            for rec in data["body"]:
                completions.append({"word": rec["name"],
                                    "menu": rec["kind"],
                                    "info": rec["kindModifiers"]
                                    })
        return completions
